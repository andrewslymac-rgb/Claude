import { Sparkles } from "lucide-react";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { aiEnabled } from "@/lib/meetings/ask";
import { listUnanswered } from "@/lib/answers/log";
import { PageHeader } from "@/components/ui/PageHeader";
import { GetAnswer } from "@/components/GetAnswer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get an answer · Orbit" };

/** Ask a question in plain words; the answer comes from this company's published SOPs, documents, meetings, tasks and links. */
export default async function AnswerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, abilities } = await requireWorkspacePage(slug);
  const isAdmin = can(abilities, "view_dashboards");
  const unanswered = isAdmin ? await listUnanswered(workspace.id) : [];
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <PageHeader eyebrow={workspace.name} title="Get an answer" icon={<Sparkles size={22} className="text-accent" />} subtitle={`Ask how something is done at ${workspace.name}. The answer comes from our published SOPs, documents, meetings, tasks and links, with the sources underneath.`} />
      <GetAnswer slug={slug} aiEnabled={aiEnabled()} isAdmin={isAdmin} unanswered={unanswered} />
    </div>
  );
}
