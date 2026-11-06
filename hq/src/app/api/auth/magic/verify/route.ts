import { NextResponse, type NextRequest } from "next/server";
import { redeemLoginLink, SignInError } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const token = req.nextUrl.searchParams.get("token") ?? "";
  try {
    await redeemLoginLink(token);
  } catch (e) {
    const msg = e instanceof SignInError ? e.message : "Sign-in failed. Please try again.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, base));
  }
  return NextResponse.redirect(new URL("/", base));
}
