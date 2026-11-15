import "server-only";
import { JWT } from "google-auth-library";
import { serviceAccount } from "@/lib/drive/client";

/**
 * Gmail for one shared inbox, through the Google service account Orbit already uses for Drive.
 * It works once a Google Workspace admin lets that service account act for the domain
 * (Admin console > Security > API controls > Domain-wide delegation) with the scopes below.
 *
 * This file reads mail and saves drafts. It has no function that sends, on purpose.
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

/* ---------- Drafts ---------- */

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const encWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
const b64 = (s: string) => wrap76(Buffer.from(s, "utf8").toString("base64"));

export type DraftInput = { to: string[]; cc: string[]; subject: string; text: string; html: string; attachments?: { filename: string; mimeType: string; content: Buffer }[] };

/** Builds the raw message for a draft. Addresses are checked so nothing can smuggle in extra headers. */
export function buildMime(from: string, d: DraftInput) {
  for (const a of [...d.to, ...d.cc]) if (!EMAIL.test(a)) throw new GmailError(`"${a.slice(0, 60)}" isn't a valid email address.`, 400);
  if (!d.to.length) throw new GmailError("Add at least one address in To.", 400);
  const subject = d.subject.replace(/[\r\n]+/g, " ").slice(0, 300);
  const bnd = (p: string) => `${p}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const alt = bnd("alt");
  const body = [`--${alt}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(d.text), `--${alt}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(d.html), `--${alt}--`].join("\r\n");
  const head = [`From: ${from}`, `To: ${d.to.join(", ")}`, ...(d.cc.length ? [`Cc: ${d.cc.join(", ")}`] : []), `Subject: ${encWord(subject)}`, "MIME-Version: 1.0"];
  if (!d.attachments?.length) return [...head, `Content-Type: multipart/alternative; boundary="${alt}"`, "", body].join("\r\n");
  const mix = bnd("mix");
  const parts = d.attachments.map((a) => {
    const name = encWord(a.filename.replace(/[\r\n"\\/]+/g, " ").slice(0, 150));
    const type = /^[\w.+-]+\/[\w.+-]+$/.test(a.mimeType) ? a.mimeType : "application/octet-stream";
    return [`--${mix}`, `Content-Type: ${type}; name="${name}"`, `Content-Disposition: attachment; filename="${name}"`, "Content-Transfer-Encoding: base64", "", wrap76(a.content.toString("base64"))].join("\r\n");
  });
  return [...head, `Content-Type: multipart/mixed; boundary="${mix}"`, "", `--${mix}`, `Content-Type: multipart/alternative; boundary="${alt}"`, "", body, ...parts, `--${mix}--`].join("\r\n");
}

/** Saves a draft in the mailbox's Drafts folder. It is not sent; only a person in Gmail can send it. */
export async function createDraft(mailbox: string, d: DraftInput): Promise<{ id: string; viewUrl: string }> {
  const raw = Buffer.from(buildMime(mailbox, d), "utf8").toString("base64url");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { Authorization: `Bearer ${await token(mailbox, GMAIL_COMPOSE)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    if (res.status === 403 && /has not been used|disabled/i.test(body)) throw new GmailError("The Gmail API is switched off in Orbit's Google Cloud project. Turn it on there, then try again.", 403);
    throw new GmailError(`Gmail didn't confirm the draft (${res.status}). Check the Drafts folder before trying again so you don't get a duplicate.`, res.status);
  }
  const j = (await res.json()) as { id: string; message?: { threadId?: string } };
  return { id: j.id, viewUrl: j.message?.threadId ? threadUrl(mailbox, j.message.threadId) : `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#drafts` };
}
