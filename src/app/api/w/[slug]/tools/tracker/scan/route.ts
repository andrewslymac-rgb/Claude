import { NextResponse, type NextRequest } from "next/server";
import { requireTool } from "@/lib/tools/access";
import { ADAPT_MAILBOX } from "@/lib/tools/apps";
import { runScan } from "@/lib/tools/tracker/scan";
import { ForbiddenError } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Reads new mail and returns proposed updates. Saves nothing. Editors and up. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { workspace } = await requireTool((await params).slug, "tracker", "edit");
    return NextResponse.json(await runScan(workspace.id, ADAPT_MAILBOX));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ForbiddenError ? 403 : 400 });
  }
}
