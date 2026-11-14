import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAbility } from "@/lib/access";
import { addTaskFile, MAX_FILE_BYTES } from "@/lib/services/task-files";

export const dynamic = "force-dynamic";

/** Upload one attachment to a task. Anyone in the company can attach (e.g. a photo of finished work). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; taskId: string }> }) {
  const { slug, taskId } = await params;
  try {
    const { user, workspace } = await requireAbility(slug, "read");
    const id = z.string().uuid().parse(taskId);
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_FILE_BYTES + 64 * 1024) return NextResponse.json({ error: "Files can be up to 10 MB." }, { status: 413 });
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof File)) return NextResponse.json({ error: "No file was sent." }, { status: 400 });
    const fileId = await addTaskFile(workspace.id, id, { name: f.name, type: f.type, bytes: Buffer.from(await f.arrayBuffer()) }, user.id);
    revalidatePath(`/w/${slug}/tasks/${id}`);
    return NextResponse.json({ id: fileId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
