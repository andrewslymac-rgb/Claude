import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireAbility } from "@/lib/access";
import { authorizeUrl } from "@/lib/integrations/jobber";
import { appUrl } from "@/lib/oauth-meta";

/** Settings → Integrations → "Connect Jobber". */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  try {
    await requireAbility(slug, "manage_workspace");
    const state = `${slug}.${randomBytes(16).toString("base64url")}`;
    (await cookies()).set("orbit_jobber_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
    return NextResponse.redirect(await authorizeUrl(state));
  } catch (e) {
    return NextResponse.redirect(new URL(`/w/${slug}/settings?tab=integrations&error=${encodeURIComponent((e as Error).message)}`, appUrl()));
  }
}
