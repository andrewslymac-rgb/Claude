import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireTool } from "@/lib/tools/access";
import { isAppId } from "@/lib/tools/apps";
import { loadDocs, writeDoc } from "@/lib/tools/store";
import { ForbiddenError } from "@/lib/permissions";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string; app: string }> };
const fail = (e: unknown) => NextResponse.json({ error: (e as Error).message }, { status: e instanceof ForbiddenError ? 403 : 400 });

/** Everything the tool shows. Any member of the company. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { slug, app } = await params;
    if (!isAppId(app)) throw new ForbiddenError("That tool isn't available here.");
    const { workspace, user } = await requireTool(slug, app, "view");
    return NextResponse.json(await loadDocs(app, workspace.id, user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

const Write = z.object({ collection: z.string(), id: z.string(), op: z.enum(["set", "update", "delete"]), data: z.unknown().optional() });

/** One change from the tool's screens. Editors and up. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, app } = await params;
    if (!isAppId(app)) throw new ForbiddenError("That tool isn't available here.");
    const { workspace, user, canAdmin } = await requireTool(slug, app, "edit");
    await writeDoc(app, workspace.id, user.id, canAdmin, Write.parse(await req.json()));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
