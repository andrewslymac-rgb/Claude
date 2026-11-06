import "server-only";
import { JWT } from "google-auth-library";

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
export function serviceAccountStatus(): ServiceAccountStatus {
  let raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "").trim();
  if (!raw) return { state: "missing" };
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"') && !raw.startsWith('{"'))) raw = raw.slice(1, -1);
  if (!raw.startsWith("{")) {
    try {
      raw = Buffer.from(raw, "base64").toString("utf8").trim();
    } catch {}
  }
  if (!raw.startsWith("{")) return { state: "invalid", reason: "The value doesn't start with { — paste the whole contents of the downloaded .json file." };
  try {
    const j = JSON.parse(raw.replace(/\r/g, ""));
    if (!j.client_email) return { state: "invalid", reason: "No client_email in the file. Is this a service account key?" };
    if (!j.private_key) return { state: "invalid", reason: "No private_key in the file." };
    return { state: "ok", email: j.client_email };
  } catch (e) {
    return { state: "invalid", reason: `Not valid JSON (${(e as Error).message.slice(0, 80)}). Re-copy the entire file, including the first { and last }.` };
  }
}

export function serviceAccount(): { client_email: string; private_key: string } | null {
  if (serviceAccountStatus().state !== "ok") return null;
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!.trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"') && !raw.startsWith('{"'))) raw = raw.slice(1, -1);
  if (!raw.startsWith("{")) raw = Buffer.from(raw, "base64").toString("utf8").trim();
  const j = JSON.parse(raw.replace(/\r/g, ""));
  // A key pasted with literal line breaks instead of "\n" still works once normalised.
  j.private_key = String(j.private_key).replace(/\\n/g, "\n");
  return j;
}

export const driveEnabled = () => Boolean(serviceAccount());

let jwt: JWT | null = null;
async function token() {
  const sa = serviceAccount();
  if (!sa) throw new Error("Google Drive isn't set up: GOOGLE_SERVICE_ACCOUNT_JSON is missing.");
  jwt ??= new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
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
