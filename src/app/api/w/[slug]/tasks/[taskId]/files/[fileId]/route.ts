import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAbility } from "@/lib/access";
import { getTaskFile, INLINE } from "@/lib/services/task-files";

export const dynamic = "force-dynamic";

/** Download or view an attachment. Only people in the same company can fetch it. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; taskId: string; fileId: string }> }) {
  const { slug, taskId, fileId } = await params;
  try {
    const { workspace } = await requireAbility(slug, "read");
    const f = await getTaskFile(workspace.id, z.string().uuid().parse(taskId), z.string().uuid().parse(fileId));
    if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (f.url) return NextResponse.redirect(f.url);
    const type = f.mimeType ?? "application/octet-stream";
    const inline = INLINE.test(type) && req.nextUrl.searchParams.get("download") !== "1";
    return new NextResponse(new Uint8Array(f.data ?? Buffer.alloc(0)), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(f.size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
}
