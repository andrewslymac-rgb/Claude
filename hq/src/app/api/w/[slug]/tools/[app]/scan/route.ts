import { NextResponse, type NextRequest } from "next/server";
import { requireTool } from "@/lib/tools/access";
import { ADAPT_MAILBOX } from "@/lib/tools/apps";
import { runScan } from "@/lib/tools/tracker/scan";
import { ForbiddenError } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Compliance Tracker only: reads new mail and returns proposed updates. Saves nothing. Editors and up. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string; app: string }> }) {
  try {
    const { slug, app } = await params;
    if (app !== "tracker") throw new ForbiddenError("That tool doesn't scan email.");
    const { workspace } = await requireTool(slug, "tracker", "edit");
    return NextResponse.json(await runScan(workspace.id, ADAPT_MAILBOX));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ForbiddenError ? 403 : 400 });
  }
}
