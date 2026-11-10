"use client";

import { useState, useTransition } from "react";
import { addMemberAction, cancelInviteAction, changeRoleAction, removeMemberAction, resendInviteAction, setMemberRolesAction } from "@/app/actions";
import type { Role } from "@/db/schema";

type JobRole = { id: string; name: string; emoji: string; color: string };
type Member = { userId: string; email: string; name: string | null; avatarUrl: string | null; role: Role; lastSeenAt: string | null; jobRoles: JobRole[] };
type Pending = { id: string; email: string; role: Role };
type Roles = Record<Role, { label: string; help: string }>;
const ORDER: Role[] = ["viewer", "editor", "admin", "owner"];

export function MembersPanel({ slug, myRole, myId, canManage, members, pending, roles, jobRoles }: { slug: string; myRole: Role; myId: string; canManage: boolean; members: Member[]; pending: Pending[]; roles: Roles; jobRoles: JobRole[] }) {
  const [picking, setPicking] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const assignable = ORDER.filter((r) => myRole === "owner" || r === "viewer" || r === "editor");

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Something went wrong" });
    });

  return (
    <div className="mt-3 space-y-4">
      {canManage && (
        <form
          className="card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await addMemberAction(slug, email, role);
              if (r.ok) setEmail("");
              return r;
            });
          }}
        >
          <div className="mb-2 text-sm font-medium">Add a person</div>
          <div className="flex flex-wrap gap-2">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm" />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-lg border border-line px-2 py-2 text-sm">
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {roles[r].label}
                </option>
              ))}
            </select>
            <button disabled={busy} className="btn btn-primary">
              Add
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-faint">{roles[role].help}. We'll email them a sign-in link right away.</p>
        </form>
      )}
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}

      <ul className="divide-y divide-line rounded-xl border border-line">
        {members.map((m) => {
          const editable = canManage && m.userId !== myId && (myRole === "owner" || (m.role !== "owner" && m.role !== "admin"));
          return (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-side text-sm font-semibold text-ink-soft">{(m.name ?? m.email)[0].toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {m.name ?? m.email} {m.userId === myId && <span className="text-ink-faint">(you)</span>}
                </div>
                <div className="truncate text-xs text-ink-faint">{m.email}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {m.jobRoles.map((r) => (
                    <span key={r.id} className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: `${r.color}33`, color: r.color }}>
                      {r.emoji} {r.name}
                    </span>
                  ))}
                  {canManage && jobRoles.length > 0 && (
                    <button onClick={() => setPicking(picking === m.userId ? null : m.userId)} className="rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-ink-faint hover:bg-hover hover:text-ink">
                      {m.jobRoles.length ? "change roles" : "+ job role"}
                    </button>
                  )}
                </div>
                {picking === m.userId && (
                  <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg border border-line bg-side p-2">
                    {jobRoles.map((r) => {
                      const on = m.jobRoles.some((x) => x.id === r.id);
                      return (
                        <button
                          key={r.id}
                          disabled={busy}
                          onClick={() => run(() => setMemberRolesAction(slug, m.userId, on ? m.jobRoles.filter((x) => x.id !== r.id).map((x) => x.id) : [...m.jobRoles.map((x) => x.id), r.id]))}
                          className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:bg-hover"}`}
                        >
                          {r.emoji} {r.name}
                        </button>
                      );
                    })}
                    <button onClick={() => setPicking(null)} className="rounded-full px-2 py-1 text-xs text-ink-faint hover:bg-hover">
                      done
                    </button>
                  </div>
                )}
              </div>
              {editable ? (
                <>
                  <select value={m.role} disabled={busy} onChange={(e) => run(() => changeRoleAction(slug, m.userId, e.target.value as Role))} className="rounded-lg border border-line px-2 py-1 text-sm">
                    {assignable.map((r) => (
                      <option key={r} value={r}>
                        {roles[r].label}
                      </option>
                    ))}
                  </select>
                  <button disabled={busy} onClick={() => run(() => resendInviteAction(slug, m.email))} className="btn btn-ghost btn-sm" title="Email them a fresh sign-in link">
                    Send link
                  </button>
                  <button disabled={busy} onClick={() => confirm(`Remove ${m.name ?? m.email} from this workspace?`) && run(() => removeMemberAction(slug, m.userId))} className="btn btn-danger btn-sm">
                    Remove
                  </button>
                </>
              ) : (
                <span className="text-sm text-ink-soft">{roles[m.role].label}</span>
              )}
            </li>
          );
        })}
        {pending.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-line text-sm text-ink-faint">?</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{p.email}</div>
              <div className="text-xs text-ink-faint">Invited · hasn&apos;t signed in yet</div>
            </div>
            <span className="text-sm text-ink-soft">{roles[p.role].label}</span>
            {canManage && (
              <>
                <button disabled={busy} onClick={() => run(() => resendInviteAction(slug, p.email))} className="btn btn-secondary btn-sm">
                  Resend link
                </button>
                <button disabled={busy} onClick={() => run(() => cancelInviteAction(slug, p.id))} className="btn btn-ghost btn-sm">
                  Cancel
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
