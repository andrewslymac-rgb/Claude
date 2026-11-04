import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { decodeIdToken } from "arctic";
import { googleClient } from "@/lib/auth/google";
import { signInWithVerifiedEmail, SignInError } from "@/lib/auth/session";

type GoogleClaims = { email: string; email_verified: boolean; name?: string; picture?: string };

export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
  const fail = (code: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(code)}`, appUrl));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("g_state")?.value;
  const verifier = jar.get("g_verifier")?.value;
  jar.delete("g_state");
  jar.delete("g_verifier");
  if (!code || !state || !expected || state !== expected || !verifier) return fail("expired");

  try {
    const tokens = await googleClient().validateAuthorizationCode(code, verifier);
    const claims = decodeIdToken(tokens.idToken()) as GoogleClaims;
    if (!claims.email || !claims.email_verified) return fail("unverified_email");
    await signInWithVerifiedEmail({ email: claims.email, name: claims.name, avatarUrl: claims.picture });
  } catch (e) {
    if (e instanceof SignInError) return fail(e.message);
    console.error("Google sign-in failed", e);
    return fail("google_failed");
  }
  return NextResponse.redirect(new URL("/", appUrl));
}
