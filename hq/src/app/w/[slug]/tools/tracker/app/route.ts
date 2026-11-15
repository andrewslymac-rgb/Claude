import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { requireTool } from "@/lib/tools/access";

export const dynamic = "force-dynamic";

let cached: string | null = null;
const source = async () => (cached && process.env.NODE_ENV === "production" ? cached : (cached = await readFile(path.join(process.cwd(), "tools-src", "tracker.html"), "utf8")));

/**
 * The tracker's screens, shown inside the Orbit page in a frame. Only members of the company
 * that has the tool get it; everyone else gets a 404. The screens themselves hold no data:
 * they load it from the tracker API with the person's own Orbit sign-in.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let access;
  try {
    access = await requireTool(slug, "tracker", "view");
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const orbit = { api: `/api/w/${access.workspace.slug}/tools/tracker`, canWrite: access.canEdit, canAdmin: access.canAdmin, user: access.user.name ?? access.user.email };
  const html = (await source()).replace("/*__ORBIT__*/", `window.ORBIT=${JSON.stringify(orbit).replace(/</g, "\\u003c")};`);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": "frame-ancestors 'self'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" },
  });
}
