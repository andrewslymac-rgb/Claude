import { NextResponse, type NextRequest } from "next/server";
import { consumeNext, devLoginEnabled, rememberNext, signInWithVerifiedEmail, SignInError } from "@/lib/auth/session";

/** Local-only sign-in by email. Disabled in production unless ALLOW_DEV_LOGIN=true. */
export async function POST(req: NextRequest) {
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  if (!devLoginEnabled()) return NextResponse.json({ error: "Dev login is disabled" }, { status: 403 });
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim();
  await rememberNext(String(form.get("next") ?? ""));
  if (!email) return NextResponse.redirect(new URL("/login?error=Enter an email", base), 303);
  try {
    await signInWithVerifiedEmail({ email });
  } catch (e) {
    const msg = e instanceof SignInError ? e.message : "Sign-in failed";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, base), 303);
  }
  return NextResponse.redirect(new URL(await consumeNext(), base), 303);
}
