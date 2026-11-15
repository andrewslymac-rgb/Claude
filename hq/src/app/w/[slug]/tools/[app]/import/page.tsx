import { notFound } from "next/navigation";
import { Upload } from "lucide-react";
import { toolPage } from "@/lib/tools/access";
import { isAppId } from "@/lib/tools/apps";
import { appDef } from "@/lib/tools/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolImport } from "@/components/tools/ToolImport";

export const dynamic = "force-dynamic";

/** Bring a JSON export of a built-in tool into Orbit. Owners and admins only. */
export default async function ToolImportPage({ params }: { params: Promise<{ slug: string; app: string }> }) {
  const { slug, app: id } = await params;
  if (!isAppId(id)) notFound();
  const { workspace, canAdmin, app } = await toolPage(slug, id);
  if (!canAdmin) notFound();
  const def = appDef(id);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <PageHeader eyebrow={workspace.name} title={`Import: ${app.label}`} icon={<Upload size={22} className="text-accent" />} subtitle="Bring in a JSON export. Nothing is saved until you press Import." />
      <ToolImport slug={slug} app={id} label={app.label} lists={Object.keys(def.labels)} settings={def.configKeys} />
    </div>
  );
}
