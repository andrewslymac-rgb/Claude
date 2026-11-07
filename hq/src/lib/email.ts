import "server-only";

/**
 * Sends email through Resend's HTTP API. No API key = emails are printed to the
 * server log instead (handy for local testing).
 */
export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY);

export async function sendEmail(input: { to: string; subject: string; html: string; text: string }) {
  const from = process.env.EMAIL_FROM ?? "Orbit <signin@myorbithq.net>";
  if (!emailEnabled()) {
    console.log(`\n[email not configured] To: ${input.to}\nSubject: ${input.subject}\n\n${input.text}\n`);
    return { ok: true as const, logged: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return { ok: false as const };
  }
  return { ok: true as const, logged: false };
}

export function signInEmail(link: string, appName = "Orbit") {
  const text = `Click to sign in to ${appName}:\n\n${link}\n\nThis link works once and expires in 15 minutes. If you didn't ask for it, you can ignore this email.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f1f1d">
  <div style="font-size:22px;font-weight:700;margin-bottom:16px">${appName}</div>
  <p style="font-size:16px;line-height:1.5">Click the button to sign in. The link works once and expires in 15 minutes.</p>
  <p style="font-size:14px;line-height:1.5;color:#555">Tip: the Orbit window where you asked for this link signs in on its own as soon as you click, even if the link opens somewhere else.</p>
  <p style="margin:28px 0"><a href="${link}" style="background:#4f5fd8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">Sign in to ${appName}</a></p>
  <p style="font-size:13px;color:#777">If the button doesn't work, copy this address into your browser:<br><a href="${link}" style="color:#4f5fd8">${link}</a></p>
  <p style="font-size:13px;color:#777">If you didn't ask for this, you can ignore it.</p>
</div>`;
  return { subject: `Sign in to ${appName}`, html, text };
}
