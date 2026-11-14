import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listMembers } from "@/lib/services/members";
import { monthGrid, taskCalendar } from "@/lib/services/task-calendar";
import { todayISO } from "@/lib/recurrence";
import { TaskCalendar } from "@/components/tasks/TaskCalendar";

export const dynamic = "force-dynamic";

/** Each person's tasks on a month calendar. People who don't manage tasks only see their own. */
export default async function TaskCalendarPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ person?: string; m?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { user, workspace, abilities } = await requireWorkspacePage(slug);
  const canManage = can(abilities, "manage_tasks");
  const { members } = await listMembers(workspace.id);
  const ids = new Set(members.map((m) => m.userId));
  let person: string | null = user.id;
  if (canManage && sp.person === "all") person = null;
  else if (canManage && sp.person && ids.has(sp.person)) person = sp.person;
  const ym = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : todayISO().slice(0, 7);
  const g = monthGrid(ym);
  const data = await taskCalendar(workspace.id, person, g.gridFrom, g.gridTo);
  return (
    <TaskCalendar
      slug={slug}
      month={ym}
      grid={g}
      data={data}
      person={person ?? "all"}
      me={user.id}
      people={canManage ? members.map((m) => ({ id: m.userId, name: m.name ?? m.email })) : []}
    />
  );
}
