import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Flag, LogOut } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspacesForUser } from "@/lib/access";
import { listTasks } from "@/lib/services/tasks";
import { listFlags } from "@/lib/services/flags";
import { NewWorkspaceForm } from "@/components/NewWorkspaceForm";
import { OrbitWordmark } from "@/components/OrbitLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { signOutAction } from "./actions";

export default async function Hub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const list = await listWorkspacesForUser(user);
  if (list.length === 1 && !user.isAppAdmin) redirect(`/w/${list[0].slug}`);

  // A real cross-company pulse instead of a placeholder: what needs attention in each.
  const pulse = await Promise.all(
    list.map(async (w) => {
      try {
        const [tasks, flags] = await Promise.all([listTasks(w.id), listFlags(w.id)]);
        return { slug: w.slug, overdue: tasks.filter((t) => t.state === "overdue").length, today: tasks.filter((t) => t.state === "today").length, flags: flags.filter((f) => f.status === "open").length };
      } catch {
        return { slug: w.slug, overdue: 0, today: 0, flags: 0, error: true };
      }
    }),
  );
  const by = new Map(pulse.map((p) => [p.slug, p]));
  const totals = pulse.reduce((t, p) => ({ overdue: t.overdue + p.overdue, today: t.today + p.today, flags: t.flags + p.flags }), { overdue: 0, today: 0, flags: 0 });

  const hour = +new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Los_Angeles" });
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = user.firstName || (user.name ?? "").split(" ")[0] || "there";

  return (
    <main className="orbit-bg mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
      <header className="flex items-center justify-between">
        <OrbitWordmark size={30} />
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <form action={signOutAction}>
            <button className="rounded-lg p-2 text-ink-soft hover:bg-hover hover:text-ink" title={`Sign out (${user.email})`} aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </header>

      <section className="orbit-hero anim-rise mt-8 rounded-2xl border border-line p-7">
        <div className="eyebrow">Your business headquarters</div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
          {greeting}, {first}.
        </h1>
        <p className="mt-2 text-lg text-ink-soft md:text-xl">
          {totals.overdue + totals.today + totals.flags === 0
            ? "Everything is on track across your companies."
            : `${[totals.overdue && `${totals.overdue} overdue`, totals.today && `${totals.today} due today`, totals.flags && `${totals.flags} open flags`].filter(Boolean).join(", ")} across your companies.`}
        </p>
      </section>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {list.map((w, i) => {
          const p = by.get(w.slug);
          const calm = p && !p.error && p.overdue === 0 && p.today === 0 && p.flags === 0;
          return (
            <Link key={w.slug} href={`/w/${w.slug}`} className="card card-hover anim-rise group p-6" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl" style={{ background: `${w.color}40`, boxShadow: `inset 0 0 0 1px ${w.color}99` }}>
                  {w.icon}
                </span>
                <ArrowRight size={16} className="text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-accent" />
              </div>
              <div className="mt-5 text-xl font-semibold">{w.name}</div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {p?.error ? (
                  <span className="text-ink-faint">Couldn&apos;t load numbers</span>
                ) : calm ? (
                  <span className="inline-flex items-center gap-1 text-ok">
                    <CheckCircle2 size={12} /> All clear
                  </span>
                ) : (
                  <>
                    {p!.overdue > 0 && (
                      <span className="num inline-flex items-center gap-1 text-danger">
                        <AlertTriangle size={12} /> {p!.overdue} overdue
                      </span>
                    )}
                    {p!.today > 0 && <span className="num text-warn">{p!.today} due today</span>}
                    {p!.flags > 0 && (
                      <span className="num inline-flex items-center gap-1 text-ink-soft">
                        <Flag size={12} /> {p!.flags} flags
                      </span>
                    )}
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {user.isAppAdmin && (
        <details className="card mt-8 p-5">
          <summary className="cursor-pointer text-sm font-medium text-ink-soft">Add a company</summary>
          <div className="mt-4 max-w-sm">
            <NewWorkspaceForm />
          </div>
        </details>
      )}
      {list.length === 0 && !user.isAppAdmin && <p className="mt-6 text-ink-soft">You don&apos;t have access to any companies yet. Ask an admin to add you, then refresh.</p>}
    </main>
  );
}
