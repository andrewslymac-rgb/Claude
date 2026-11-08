import { NextResponse, type NextRequest } from "next/server";
import { requireAbility } from "@/lib/access";
import { snapshot } from "@/lib/integrations/jobber";

export const dynamic = "force-dynamic";

/** Live numbers for the Jobber dashboard tile. Cached for 3 minutes per company. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { workspace } = await requireAbility(slug, "read");
    const force = req.nextUrl.searchParams.get("refresh") === "1";
    if (workspace.fieldTool === "none") return NextResponse.json({ error: "No field-service software set for this company." }, { status: 400 });
    return NextResponse.json(await snapshot(workspace.id, force, workspace.fieldTool), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
