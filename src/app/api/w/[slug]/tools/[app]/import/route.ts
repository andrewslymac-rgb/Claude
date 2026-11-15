import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireTool } from "@/lib/tools/access";
import { isAppId } from "@/lib/tools/apps";
import { appDef, planImport, runImport, loadDocs } from "@/lib/tools/store";
import { ForbiddenError } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const Body = z.object({ json: z.unknown(), mode: z.enum(["preview", "merge", "replace"]) });

/** Checks an export file ("preview") or brings it in ("merge" / "replace"). Owners and admins. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; app: string }> }) {
  try {
    const { slug, app } = await params;
    if (!isAppId(app)) throw new ForbiddenError("That tool isn't available here.");
    const { workspace, user } = await requireTool(slug, app, "admin");
    const { json, mode } = Body.parse(await req.json());
    const plan = planImport(app, json);
    const labels = appDef(app).labels;
    const now = await loadDocs(app, workspace.id, user.id);
    const rows = Object.entries(labels).map(([c, label]) => ({ label, incoming: Object.keys(plan.docs[c]).length, existing: Object.keys(now[c] ?? {}).length }));
    const settings = Object.keys(plan.docs.config);
    if (mode === "preview") return NextResponse.json({ rows, settings, problems: plan.problems });
    if (!rows.some((r) => r.incoming) && !settings.length) throw new Error("There's nothing in that file to import.");
    await runImport(app, workspace.id, user.id, plan, mode);
    return NextResponse.json({ ok: true, rows, problems: plan.problems });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ForbiddenError ? 403 : 400 });
  }
}
