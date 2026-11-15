import { notFound } from "next/navigation";
import { Upload } from "lucide-react";
import { toolPage } from "@/lib/tools/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { TrackerImport } from "@/components/tools/TrackerImport";

export const dynamic = "force-dynamic";

/** Bring a JSON export of the tracker into Orbit. Owners and admins only. */
export default async function TrackerImportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, canAdmin } = await toolPage(slug, "tracker");
  if (!canAdmin) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <PageHeader eyebrow={workspace.name} title="Import tracker data" icon={<Upload size={22} className="text-accent" />} subtitle="Bring in a JSON export of the Compliance Tracker. Nothing is saved until you press Import." />
      <TrackerImport slug={slug} />
    </div>
  );
}
