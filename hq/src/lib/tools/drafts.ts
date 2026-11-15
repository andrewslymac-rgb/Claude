import "server-only";
import { z } from "zod";
import { ADAPT_MAILBOX } from "./apps";
import { createDraft } from "./gmail";

/**
 * The rules every email from the Adapt tools follows, enforced here on the server so the
 * screens can't skip them: it is saved as a draft in info@ (never sent), Alex is CC'd,
 * and it ends with the company signature.
 */
export const ALWAYS_CC = "alex@adaptpestpros.com";
export const SIG_HTML = `<div style="font-family:Arial,sans-serif;font-size:14px;"><a href="https://adaptpestpros.com/"><img src="https://ci3.googleusercontent.com/mail-sig/AIorK4ydiMyLf6zi1mdST0DCzX9oBYzCr1lMsx1K0q43JpveOtEh7T7b2GsLcVYa6FW2VnEF4Q69CbEUPpUD" width="96" height="96" alt="Adapt Pest Pros" style="display:block;border:0;"></a><br><b>Andrew MacIntosh</b><br>Adapt Pest Control Professionals<br><a href="tel:5036626443">503-662-6443</a><br><a href="https://adaptpestpros.com/">adaptpestpros.com</a><br><br><b><i>We are hiring all star Pest Pros!</i></b></div>`;
export const SIG_TEXT = `Andrew MacIntosh\nAdapt Pest Control Professionals\n503-662-6443\nadaptpestpros.com\n\nWe are hiring all star Pest Pros!`;

const addr = z.string().trim().min(3).max(254);
export const DraftBody = z.object({
  to: z.array(addr).min(1).max(20),
  cc: z.array(addr).max(20).optional().default([]),
  subject: z.string().max(300),
  body: z.string().max(100_000),
  htmlBody: z.string().max(300_000),
  attachments: z.array(z.object({ filename: z.string().min(1).max(200), mimeType: z.string().max(100), content: z.string().max(14_000_000) })).max(3).optional().default([]),
});

export async function saveAdaptDraft(input: z.infer<typeof DraftBody>) {
  const cc = [...new Set([...input.cc, ALWAYS_CC].map((a) => a.toLowerCase()))].filter((a) => !input.to.some((t) => t.toLowerCase() === a));
  const text = input.body.includes("We are hiring all star Pest Pros!") ? input.body : `${input.body}\n\n${SIG_TEXT}`;
  const html = input.htmlBody.includes(SIG_HTML) ? input.htmlBody : input.htmlBody + SIG_HTML;
  return createDraft(ADAPT_MAILBOX, { to: input.to, cc, subject: input.subject, text, html, attachments: input.attachments.map((a) => ({ filename: a.filename, mimeType: a.mimeType, content: Buffer.from(a.content, "base64") })) });
}
