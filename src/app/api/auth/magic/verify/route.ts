import { NextResponse, type NextRequest } from "next/server";
import { consumeNext, redeemLoginLink, SignInError } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const token = req.nextUrl.searchParams.get("token") ?? "";
  let sameBrowser = true;
  try {
    ({ sameBrowser } = await redeemLoginLink(token));
  } catch (e) {
    const msg = e instanceof SignInError ? e.message : "Sign-in failed. Please try again.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, base));
  }
  // Opened somewhere other than where it was requested (another Chrome profile, a phone):
  // the original window is signing itself in, so say so instead of dropping them in here.
  if (!sameBrowser) return NextResponse.redirect(new URL("/login/opened", base));
  return NextResponse.redirect(new URL(await consumeNext(), base));
}
