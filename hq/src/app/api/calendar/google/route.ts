import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { generateCodeVerifier, generateState } from "arctic";
import { getCurrentUser } from "@/lib/auth/session";
import { googleCal, googleCalendarEnabled, GOOGLE_SCOPES } from "@/lib/calendar";

/** Starts "Connect Google Calendar" for the signed-in person. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const back = req.nextUrl.searchParams.get("back") ?? "/";
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back)}`, req.nextUrl.origin));
  if (!googleCalendarEnabled()) return NextResponse.redirect(new URL(`${back}?calendar=not_configured`, req.nextUrl.origin));
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = googleCal().createAuthorizationURL(state, verifier, GOOGLE_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // so Google hands back a refresh token
  url.searchParams.set("include_granted_scopes", "true");
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };
  jar.set("cal_state", state, opts);
  jar.set("cal_verifier", verifier, opts);
  jar.set("cal_back", back.startsWith("/") && !back.startsWith("//") ? back : "/", opts);
  return NextResponse.redirect(url);
}
