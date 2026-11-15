import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireTool } from "@/lib/tools/access";
import { planImport, runImport, loadTracker } from "@/lib/tools/tracker/store";
import { ForbiddenError } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const Body = z.object({ json: z.unknown(), mode: z.enum(["preview", "merge", "replace"]) });
const count = (o: Record<string, unknown>) => Object.keys(o).length;

/** Checks an export file ("preview") or brings it in ("merge" / "replace"). Owners and admins. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { workspace, user } = await requireTool((await params).slug, "tracker", "admin");
    const { json, mode } = Body.parse(await req.json());
    const plan = planImport(json);
    const incoming = { companies: count(plan.companies), tasks: count(plan.tasks), comms: count(plan.comms), settings: Object.keys(plan.config) };
    const now = await loadTracker(workspace.id);
    const existing = { companies: count(now.companies), tasks: count(now.tasks), comms: count(now.comms) };
    if (mode === "preview") return NextResponse.json({ incoming, existing, problems: plan.problems });
    if (!incoming.companies && !incoming.tasks && !incoming.comms && !incoming.settings.length) throw new Error("There's nothing in that file to import.");
    await runImport(workspace.id, user.id, plan, mode);
    return NextResponse.json({ ok: true, incoming, problems: plan.problems });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ForbiddenError ? 403 : 400 });
  }
}
