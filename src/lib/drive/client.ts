import "server-only";
import { JWT } from "google-auth-library";
import { getSetting } from "@/lib/services/app-settings";

export const DRIVE_KEY_SETTING = "google_service_account_json";

/**
 * Thin Google Drive REST client using a service account. The account only
 * needs Viewer access on the folder (or Shared Drive) you want synced.
 */
export type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string; webViewLink?: string; parents?: string[]; trashed?: boolean };

const API = "https://www.googleapis.com/drive/v3";
export const FOLDER = "application/vnd.google-apps.folder";
export const GDOC = "application/vnd.google-apps.document";
export const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const SHORTCUT = "application/vnd.google-apps.shortcut";

export type ServiceAccountStatus = { state: "ok"; email: string } | { state: "missing" } | { state: "invalid"; reason: string };

/**
 * Reads the service-account key from GOOGLE_SERVICE_ACCOUNT_JSON. Tolerates the
 * usual paste accidents: surrounding quotes, base64, Windows line endings, and
 * real newlines inside the private key.
 */
function normalise(input: string) {
  let raw = input.trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"') && !raw.startsWith('{"'))) raw = raw.slice(1, -1);
  if (!raw.startsWith("{")) {
    try {
      raw = Buffer.from(raw, "base64").toString("utf8").trim();
    } catch {}
  }
  return raw.replace(/\r/g, "");
}

/** Validates a pasted key without storing it. */
export function checkServiceAccountJson(input: string): ServiceAccountStatus {
  const raw = normalise(input);
  if (!raw) return { state: "missing" };
  if (!raw.startsWith("{")) return { state: "invalid", reason: "The value doesn't start with { — paste the whole contents of the downloaded .json file." };
  try {
    const j = JSON.parse(raw);
    if (!j.client_email) return { state: "invalid", reason: "No client_email in the file. Is this a service account key?" };
    if (!j.private_key) return { state: "invalid", reason: "No private_key in the file." };
    return { state: "ok", email: j.client_email };
  } catch (e) {
    return { state: "invalid", reason: `Not valid JSON (${(e as Error).message.slice(0, 80)}). Re-copy the entire file, including the first { and last }.` };
  }
}

async function rawKey(): Promise<string> {
  return (await getSetting(DRIVE_KEY_SETTING)) ?? process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "";
}

export async function serviceAccountStatus(): Promise<ServiceAccountStatus> {
  return checkServiceAccountJson(await rawKey());
}

export async function serviceAccount(): Promise<{ client_email: string; private_key: string } | null> {
  const raw = normalise(await rawKey());
  if (checkServiceAccountJson(raw).state !== "ok") return null;
  const j = JSON.parse(raw);
  j.private_key = String(j.private_key).replace(/\\n/g, "\n");
  return j;
}

export const driveEnabled = async () => Boolean(await serviceAccount());

let jwt: JWT | null = null;
let jwtEmail = "";
async function token() {
  const sa = await serviceAccount();
  if (!sa) throw new Error("Google Drive isn't set up: no service account key.");
  if (!jwt || jwtEmail !== sa.client_email) {
    jwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
    jwtEmail = sa.client_email;
  }
  const t = await jwt.getAccessToken();
  if (!t.token) throw new Error("Couldn't get a Google access token");
  return t.token;
}

async function get(path: string, params: Record<string, string> = {}, raw = false) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries({ supportsAllDrives: "true", ...params })) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` } });
  if (!res.ok) throw new Error(`Drive ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return raw ? res : res.json();
}

export async function getFile(id: string): Promise<DriveFile> {
  return get(`/files/${id}`, { fields: "id,name,mimeType,modifiedTime,webViewLink,parents,trashed,shortcutDetails" });
}

export async function listChildren(folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const j = await get("/files", {
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,parents,shortcutDetails)",
      includeItemsFromAllDrives: "true",
      pageSize: "1000",
      ...(pageToken ? { pageToken } : {}),
    });
    out.push(...(j.files ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

/** Google Doc → HTML. */
export async function exportDocHtml(id: string): Promise<string> {
  const res = (await get(`/files/${id}/export`, { mimeType: "text/html" }, true)) as Response;
  return res.text();
}

/** Any binary file (e.g. .docx) → bytes. */
export async function download(id: string): Promise<Buffer> {
  const res = (await get(`/files/${id}`, { alt: "media" }, true)) as Response;
  return Buffer.from(await res.arrayBuffer());
}

// --- Writing back to Google Docs ---------------------------------------------
// Only used to append change-log entries. Needs the Google Docs API turned on in
// the service account's Cloud project, and Editor access on the document.

let docsJwt: JWT | null = null;
let docsJwtEmail = "";
async function docsToken() {
  const sa = await serviceAccount();
  if (!sa) throw new Error("Google Drive isn't set up: no service account key.");
  if (!docsJwt || docsJwtEmail !== sa.client_email) {
    docsJwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/documents"] });
    docsJwtEmail = sa.client_email;
  }
  const t = await docsJwt.getAccessToken();
  if (!t.token) throw new Error("Couldn't get a Google access token");
  return t.token;
}

/** Turns a Docs API failure into something an owner can act on. */
function docsError(status: number, body: string, email: string) {
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(body)) return "The Google Docs API is turned off for Orbit's Google Cloud project. Turn on \"Google Docs API\" in Google Cloud, then try again.";
  if (status === 403 || status === 401) return `Orbit can read this document but can't edit it. In Google Drive, share the document (or its folder) with ${email} as Editor.`;
  if (status === 404) return "Google couldn't find this document. It may have been moved or deleted.";
  return `Google Docs said ${status}: ${body.slice(0, 160)}`;
}

type DocsParagraph = { paragraph?: { paragraphStyle?: { namedStyleType?: string }; elements?: { textRun?: { content?: string } }[] }; endIndex?: number };

/**
 * Appends one line under a "Change log" heading at the end of a Google Doc,
 * adding the heading the first time.
 */
export async function appendChangeLogToDoc(docId: string, line: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sa = await serviceAccount();
  if (!sa) return { ok: false, reason: "Google Drive isn't connected." };
  const headers = { Authorization: `Bearer ${await docsToken()}`, "Content-Type": "application/json" };
  const base = `https://docs.googleapis.com/v1/documents/${docId}`;
  const res = await fetch(base, { headers });
  if (!res.ok) return { ok: false, reason: docsError(res.status, await res.text(), sa.client_email) };
  const doc = (await res.json()) as { body?: { content?: DocsParagraph[] } };
  const content = doc.body?.content ?? [];
  const textOf = (p: DocsParagraph) => (p.paragraph?.elements ?? []).map((e) => e.textRun?.content ?? "").join("").trim();
  const hasHeading = content.some((p) => p.paragraph?.paragraphStyle?.namedStyleType?.startsWith("HEADING") && /^change log$/i.test(textOf(p)));
  const end = Math.max(1, (content.at(-1)?.endIndex ?? 2) - 1);

  const heading = "Change log";
  const text = (hasHeading ? "" : `\n${heading}`) + `\n${line}`;
  const entryStart = end + (hasHeading ? 1 : heading.length + 2);
  const requests: unknown[] = [{ insertText: { location: { index: end }, text } }];
  if (!hasHeading) requests.push({ updateParagraphStyle: { range: { startIndex: end + 1, endIndex: end + 1 + heading.length }, paragraphStyle: { namedStyleType: "HEADING_2" }, fields: "namedStyleType" } });
  requests.push({ updateParagraphStyle: { range: { startIndex: entryStart, endIndex: entryStart + line.length }, paragraphStyle: { namedStyleType: "NORMAL_TEXT" }, fields: "namedStyleType" } });
  const dateLen = line.indexOf(" — ");
  if (dateLen > 0) requests.push({ updateTextStyle: { range: { startIndex: entryStart, endIndex: entryStart + dateLen }, textStyle: { bold: true }, fields: "bold" } });

  const up = await fetch(`${base}:batchUpdate`, { method: "POST", headers, body: JSON.stringify({ requests }) });
  if (!up.ok) return { ok: false, reason: docsError(up.status, await up.text(), sa.client_email) };
  return { ok: true };
}
