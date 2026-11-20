import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { addTaskFile, MAX_FILE_BYTES } from "@/lib/services/task-files";
import { readUploadToken } from "@/lib/services/upload-links";

export const dynamic = "force-dynamic";

/**
 * Adds files to one task using an upload link (see upload-links.ts). No sign-in: the link is the permission.
 * Send multipart form data with one or more "file" fields, e.g. curl -F "file=@photo.jpg" <url>.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const link = readUploadToken((await params).token);
  if (!link) return NextResponse.json({ error: "This upload link has expired or isn't valid. Ask for a new one." }, { status: 410 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 5 * (MAX_FILE_BYTES + 64 * 1024)) return NextResponse.json({ error: "Too much at once. Send up to 5 files of 10 MB each." }, { status: 413 });
  try {
    const form = await req.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: 'No file was sent. Send it as a form field named "file".' }, { status: 400 });
    if (files.length > 5) return NextResponse.json({ error: "Send up to 5 files at a time." }, { status: 400 });
    const added: string[] = [];
    for (const f of files) {
      await addTaskFile(link.ws, link.task, { name: f.name, type: f.type || guessType(f.name), bytes: Buffer.from(await f.arrayBuffer()) }, link.user);
      added.push(f.name);
    }
    revalidatePath(`/w/${link.slug}/tasks/${link.task}`);
    return NextResponse.json({ ok: true, added });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** curl doesn't always send a type; work it out from the file name for the common cases. */
function guessType(name: string) {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", heic: "image/heic", pdf: "application/pdf", txt: "text/plain", csv: "text/csv", mp4: "video/mp4", mov: "video/quicktime", mp3: "audio/mpeg", m4a: "audio/mp4" } as Record<string, string>)[ext] ?? "";
}
