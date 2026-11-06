import { NextResponse, type NextRequest } from "next/server";
import { createLoginLink, emailIsAllowed, rememberNext } from "@/lib/auth/session";
import { sendEmail, signInEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  await rememberNext(String(form.get("next") ?? ""));
  const back = (q: string) => NextResponse.redirect(new URL(`/login?${q}`, base), 303);
  if (!email) return back("error=Enter your email");
  if (!(await emailIsAllowed(email))) return back("error=" + encodeURIComponent("You haven't been invited yet. Ask an admin to add your email."));
  const link = await createLoginLink(email);
  if (!link) return back("error=" + encodeURIComponent("Too many sign-in links requested. Check your inbox or try again in an hour."));
  const r = await sendEmail({ to: email, ...signInEmail(link) });
  if (!r.ok) return back("error=" + encodeURIComponent("Couldn't send the email. Please try again or use Google."));
  return back(`sent=${encodeURIComponent(email)}`);
}
