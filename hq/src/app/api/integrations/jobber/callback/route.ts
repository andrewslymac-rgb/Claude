import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireAbility } from "@/lib/access";
import { completeConnect } from "@/lib/integrations/jobber";
import { appUrl } from "@/lib/oauth-meta";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const expected = jar.get("orbit_jobber_state")?.value;
  const slug = state.split(".")[0] ?? "";
  const back = (q: string) => NextResponse.redirect(new URL(`/w/${slug}/settings?tab=integrations&${q}`, appUrl()));
  jar.delete("orbit_jobber_state");
  if (!expected || expected !== state) return back("error=" + encodeURIComponent("That connection attempt expired. Try again."));
  if (!code) return back("error=" + encodeURIComponent(req.nextUrl.searchParams.get("error_description") ?? "Jobber didn't send a code."));
  try {
    const { workspace, user } = await requireAbility(slug, "manage_workspace");
    await completeConnect(workspace.id, code, user.id);
  } catch (e) {
    return back("error=" + encodeURIComponent((e as Error).message));
  }
  return back("ok=jobber");
}
