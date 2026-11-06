import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { generateCodeVerifier, generateState } from "arctic";
import { googleClient } from "@/lib/auth/google";
import { googleEnabled, rememberNext } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  await rememberNext(req.nextUrl.searchParams.get("next") ?? "");
  if (!googleEnabled()) return NextResponse.redirect(new URL("/login?error=google_not_configured", process.env.APP_URL));
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = googleClient().createAuthorizationURL(state, verifier, ["openid", "email", "profile"]);
  url.searchParams.set("prompt", "select_account");
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };
  jar.set("g_state", state, opts);
  jar.set("g_verifier", verifier, opts);
  return NextResponse.redirect(url);
}
