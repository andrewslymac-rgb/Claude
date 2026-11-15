import { toolPage } from "@/lib/tools/access";

export const dynamic = "force-dynamic";

/** Compliance and Pipeline Tracker. Every member of the company can open it; editors and up can change it. */
export default async function TrackerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { app } = await toolPage(slug, "tracker");
  return (
    <div className="h-full min-h-[70dvh]">
      <iframe src={`/w/${slug}/tools/tracker/app`} title={app.label} className="block h-full min-h-[70dvh] w-full border-0 bg-white" allow="clipboard-write" />
    </div>
  );
}
