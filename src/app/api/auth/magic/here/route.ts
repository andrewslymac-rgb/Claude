import { NextResponse, type NextRequest } from "next/server";
import { consumeNext, signInWhereLinkOpened, SignInError } from "@/lib/auth/session";

/** "Open Orbit here" from /login/opened. */
export async function POST(req: NextRequest) {
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  try {
    await signInWhereLinkOpened();
  } catch (e) {
    const msg = e instanceof SignInError ? e.message : "Sign-in failed. Please try again.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, base), 303);
  }
  return NextResponse.redirect(new URL(await consumeNext(), base), 303);
}
