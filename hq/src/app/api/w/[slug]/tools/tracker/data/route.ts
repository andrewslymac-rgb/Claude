import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireTool } from "@/lib/tools/access";
import { loadTracker, writeTracker } from "@/lib/tools/tracker/store";
import { ForbiddenError } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const fail = (e: unknown) => NextResponse.json({ error: (e as Error).message }, { status: e instanceof ForbiddenError ? 403 : 400 });

/** Everything the tracker shows. Any member of the company. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { workspace } = await requireTool((await params).slug, "tracker", "view");
    return NextResponse.json(await loadTracker(workspace.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

const Write = z.object({ collection: z.string(), id: z.string(), op: z.enum(["set", "update", "delete"]), data: z.unknown().optional() });

/** One change from the tracker screens. Editors and up. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { workspace, user, canAdmin } = await requireTool((await params).slug, "tracker", "edit");
    await writeTracker(workspace.id, user.id, canAdmin, Write.parse(await req.json()));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
