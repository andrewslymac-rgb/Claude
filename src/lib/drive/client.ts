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

export function serviceAccount(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (j.client_email && j.private_key) return j;
  } catch {}
  return null;
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
