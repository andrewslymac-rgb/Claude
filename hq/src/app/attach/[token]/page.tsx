import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { OrbitWordmark } from "@/components/OrbitLogo";
import { readUploadToken } from "@/lib/services/upload-links";
import { AttachUploader } from "./AttachUploader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add a file · Orbit", robots: { index: false } };

/** Where an upload link lands: pick photos or files and they go straight onto the task. */
export default async function AttachPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = readUploadToken(token);
  const [task] = link ? await db.select({ title: schema.tasks.title }).from(schema.tasks).where(and(eq(schema.tasks.workspaceId, link.ws), eq(schema.tasks.id, link.task))) : [];
  const [ws] = link ? await db.select({ name: schema.workspaces.name }).from(schema.workspaces).where(eq(schema.workspaces.id, link.ws)) : [];
  return (
    <main className="orbit-bg flex min-h-dvh items-center justify-center px-6 pt-safe pb-safe">
      <div className="card w-full max-w-sm p-7">
        <OrbitWordmark size={26} />
        {!link || !task ? (
          <>
            <h1 className="mt-5 text-lg font-semibold">This link has expired</h1>
            <p className="mt-1 text-sm text-ink-soft">Upload links work for an hour. Ask for a new one, or open the task in Orbit and use Add file or photo.</p>
          </>
        ) : (
          <>
            <div className="eyebrow mt-5">{ws?.name}</div>
            <h1 className="mt-1 text-lg font-semibold">Add a photo or file</h1>
            <p className="mt-1 text-sm text-ink-soft">
              It will be attached to the task <span className="font-medium text-ink">{task.title}</span>.
            </p>
            <AttachUploader token={token} taskHref={`/w/${link.slug}/tasks/${link.task}`} />
          </>
        )}
      </div>
    </main>
  );
}
