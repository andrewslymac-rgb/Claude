import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { decodeIdToken } from "arctic";
import { getCurrentUser } from "@/lib/auth/session";
import { googleCal, saveGoogleConnection } from "@/lib/calendar";
import { appUrl } from "@/lib/oauth-meta";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const back = jar.get("cal_back")?.value ?? "/";
  const expected = jar.get("cal_state")?.value;
  const verifier = jar.get("cal_verifier")?.value;
  for (const k of ["cal_state", "cal_verifier", "cal_back"]) jar.delete(k);
  const done = (status: string) => NextResponse.redirect(new URL(`${back}${back.includes("?") ? "&" : "?"}calendar=${status}`, appUrl()));

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", appUrl()));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (req.nextUrl.searchParams.get("error") === "access_denied") return done("cancelled");
  if (!code || !state || !expected || state !== expected || !verifier) return done("expired");
  try {
    const t = await googleCal().validateAuthorizationCode(code, verifier);
    const claims = decodeIdToken(t.idToken()) as { email?: string };
    let refresh: string | null = null;
    try {
      refresh = t.refreshToken();
    } catch {}
    await saveGoogleConnection(user.id, { accessToken: t.accessToken(), refreshToken: refresh, expiresAt: t.accessTokenExpiresAt(), email: claims.email ?? "Google Calendar" });
    return done("connected");
  } catch (e) {
    console.error("Google Calendar connect failed", e);
    return done("failed");
  }
}
