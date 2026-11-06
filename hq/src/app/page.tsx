import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, SlidersHorizontal } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspacesForUser } from "@/lib/access";
import { NewWorkspaceForm } from "@/components/NewWorkspaceForm";
import { OrbitWordmark } from "@/components/OrbitLogo";
import { signOutAction } from "./actions";

export default async function Hub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const list = await listWorkspacesForUser(user);
  if (list.length === 1 && !user.isAppAdmin) redirect(`/w/${list[0].slug}`);

  const hour = +new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Los_Angeles" });
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = (user.name ?? "").split(" ")[0] || "there";

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
      <header className="flex items-center justify-between">
        <OrbitWordmark size={30} />
        <form action={signOutAction}>
          <button className="rounded-lg p-2 text-ink-soft hover:bg-hover hover:text-ink" title={`Sign out (${user.email})`} aria-label="Sign out">
            <SlidersHorizontal size={20} />
          </button>
        </form>
      </header>

      <section className="orbit-hero mt-8 rounded-2xl border border-line p-7">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">Your business headquarters</div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">{greeting}, {first}.</h1>
        <p className="mt-2 text-lg text-ink-soft md:text-xl">Here&apos;s what&apos;s happening across your companies.</p>
      </section>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {list.map((w) => (
          <Link key={w.slug} href={`/w/${w.slug}`} className="group rounded-2xl border border-line bg-card p-6 transition hover:border-accent/60 hover:bg-hover">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl" style={{ background: `${w.color}2e` }}>
              {w.icon}
            </span>
            <div className="mt-6 text-xl font-semibold">{w.name}</div>
          </Link>
        ))}
        <div className="rounded-2xl border border-dashed border-line p-6 opacity-70" title="Coming in Milestone 4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Bot size={24} />
          </span>
          <div className="mt-6 text-xl font-semibold">AI Command</div>
          <div className="text-sm text-ink-faint">Coming soon</div>
        </div>
      </div>

      {user.isAppAdmin && (
        <details className="mt-8 rounded-2xl border border-line bg-card p-5">
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
