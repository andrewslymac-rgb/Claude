import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { requireTool } from "@/lib/tools/access";
import { isAppId } from "@/lib/tools/apps";

export const dynamic = "force-dynamic";

/** The PDF libraries the Quote Builder loads (jsPDF and autotable), the same files it has always used. */
const FILES = new Set(["jspdf.umd.min.js", "jspdf.plugin.autotable.min.js"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; app: string; file: string }> }) {
  const { slug, app, file } = await params;
  try {
    if (!isAppId(app) || !FILES.has(file)) throw new Error("unknown");
    await requireTool(slug, app, "view");
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const body = await readFile(path.join(process.cwd(), "tools-src", "lib", file));
  return new NextResponse(new Uint8Array(body), { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
