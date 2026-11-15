import { NextResponse, type NextRequest } from "next/server";
import { requireTool } from "@/lib/tools/access";
import { DraftBody, saveAdaptDraft } from "@/lib/tools/drafts";
import { ForbiddenError } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Saves an email as a draft in info@adaptpestpros.com. It never sends. Editors and up,
 * from the COI Request Builder and the Quote Builder only.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; app: string }> }) {
  try {
    const { slug, app } = await params;
    if (app !== "coi" && app !== "quotes") throw new ForbiddenError("That tool doesn't create email drafts.");
    await requireTool(slug, app, "edit");
    return NextResponse.json(await saveAdaptDraft(DraftBody.parse(await req.json())));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ForbiddenError ? 403 : 400 });
  }
}
