import "server-only";
import { JWT } from "google-auth-library";
import { serviceAccount } from "@/lib/drive/client";

/**
 * Gmail for one shared inbox, through the Google service account Orbit already uses for Drive.
 * It works once a Google Workspace admin lets that service account act for the domain
 * (Admin console > Security > API controls > Domain-wide delegation) with the scopes below.
 *
 * This file only reads mail. Drafts come with the COI builder. Nothing here sends, on purpose.
 */
export const GMAIL_READ = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_COMPOSE = "https://www.googleapis.com/auth/gmail.compose";

export class GmailError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

const clients = new Map<string, JWT>();
async function token(mailbox: string, scope: string) {
  const sa = await serviceAccount();
  if (!sa) throw new GmailError("Gmail isn't set up: Orbit has no Google service account key.");
  const key = `${sa.client_email}|${mailbox}|${scope}`;
  let jwt = clients.get(key);
  if (!jwt) {
    jwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: [scope], subject: mailbox });
    clients.set(key, jwt);
  }
  try {
    const t = await jwt.getAccessToken();
    if (!t.token) throw new Error("no token");
    return t.token;
  } catch (e) {
    clients.delete(key);
    const msg = (e as Error).message || "";
    if (/unauthorized_client|access_denied|invalid_grant/i.test(msg))
      throw new GmailError(`Google hasn't given Orbit permission to open ${mailbox} yet. A Workspace admin needs to add Orbit's service account under Domain-wide delegation.`, 403);
    throw new GmailError(`Couldn't sign in to Gmail for ${mailbox}: ${msg.slice(0, 160)}`);
  }
}

async function api(mailbox: string, scope: string, path: string, params: Record<string, string | string[]> = {}) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me${path}`);
  for (const [k, v] of Object.entries(params)) for (const x of Array.isArray(v) ? v : [v]) url.searchParams.append(k, x);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await token(mailbox, scope)}` } });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    if (res.status === 403 && /has not been used|disabled/i.test(body)) throw new GmailError("The Gmail API is switched off in Orbit's Google Cloud project. Turn it on there, then try again.", 403);
    throw new GmailError(`Gmail didn't answer (${res.status}). Try again in a minute.`, res.status);
  }
  return res.json();
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] };
type RawMessage = { id: string; internalDate?: string; snippet?: string; payload?: Part };

const header = (m: RawMessage, name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const decode = (d?: string) => (d ? Buffer.from(d, "base64url").toString("utf8") : "");
function findPart(p: Part | undefined, mime: string): string {
  if (!p) return "";
  if (p.mimeType === mime && p.body?.data) return decode(p.body.data);
  for (const c of p.parts ?? []) {
    const t = findPart(c, mime);
    if (t) return t;
  }
  return "";
}
const stripHtml = (h: string) =>
  h
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"');

export type MailMessage = { id: string; sender: string; to: string; date: string; subject: string; text: string };
export type MailThread = { id: string; url: string; messages: MailMessage[] };

const threadUrl = (mailbox: string, id: string) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#all/${id}`;

function toMessage(m: RawMessage): MailMessage {
  const date = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : "";
  const text = findPart(m.payload, "text/plain") || stripHtml(findPart(m.payload, "text/html")) || m.snippet || "";
  return { id: m.id, sender: header(m, "From"), to: header(m, "To"), date, subject: header(m, "Subject"), text };
}

/** Thread ids matching a Gmail search, newest first. */
export async function searchThreadIds(mailbox: string, query: string, max = 40): Promise<string[]> {
  const j = await api(mailbox, GMAIL_READ, "/threads", { q: query, maxResults: String(max) });
  return ((j.threads ?? []) as { id: string }[]).map((t) => t.id);
}

/** A thread with headers only: enough to tell who wrote last and whether it has been seen. */
export async function getThreadHeaders(mailbox: string, id: string): Promise<MailThread> {
  const j = await api(mailbox, GMAIL_READ, `/threads/${id}`, { format: "metadata", metadataHeaders: ["From", "To", "Subject", "Date"] });
  return { id, url: threadUrl(mailbox, id), messages: ((j.messages ?? []) as RawMessage[]).map(toMessage) };
}

/** A thread with message text, oldest message first. */
export async function getThread(mailbox: string, id: string): Promise<MailThread> {
  const j = await api(mailbox, GMAIL_READ, `/threads/${id}`, { format: "full" });
  return { id, url: threadUrl(mailbox, id), messages: ((j.messages ?? []) as RawMessage[]).map(toMessage) };
}
