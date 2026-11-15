import { notFound } from "next/navigation";
import { toolPage } from "@/lib/tools/access";
import { isAppId } from "@/lib/tools/apps";

export const dynamic = "force-dynamic";

/** A built-in tool. Every member of the company can open it; editors and up can change it. */
export default async function ToolAppPage({ params }: { params: Promise<{ slug: string; app: string }> }) {
  const { slug, app: id } = await params;
  if (!isAppId(id)) notFound();
  const { app } = await toolPage(slug, id);
  return (
    <div className="h-full min-h-[70dvh]">
      <iframe src={`/w/${slug}/tools/${id}/app`} title={app.label} className="block h-full min-h-[70dvh] w-full border-0 bg-white" allow="clipboard-write" />
    </div>
  );
}
