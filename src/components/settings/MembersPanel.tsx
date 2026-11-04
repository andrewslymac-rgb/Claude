"use client";

import { useState, useTransition } from "react";
import { addMemberAction, cancelInviteAction, changeRoleAction, removeMemberAction } from "@/app/actions";
import type { Role } from "@/db/schema";

type Member = { userId: string; email: string; name: string | null; avatarUrl: string | null; role: Role; lastSeenAt: string | null };
type Pending = { id: string; email: string; role: Role };
type Roles = Record<Role, { label: string; help: string }>;
const ORDER: Role[] = ["viewer", "editor", "admin", "owner"];

export function MembersPanel({ slug, myRole, myId, canManage, members, pending, roles }: { slug: string; myRole: Role; myId: string; canManage: boolean; members: Member[]; pending: Pending[]; roles: Roles }) {
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
          className="rounded-xl border border-line p-4"
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
            <button disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper disabled:opacity-50">
              Add
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-faint">{roles[role].help}. They sign in with Google using this email.</p>
        </form>
      )}
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}

      <ul className="divide-y divide-line rounded-xl border border-line">
        {members.map((m) => {
          const editable = canManage && m.userId !== myId && (myRole === "owner" || (m.role !== "owner" && m.role !== "admin"));
          return (
            <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-side text-sm font-semibold text-ink-soft">{(m.name ?? m.email)[0].toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {m.name ?? m.email} {m.userId === myId && <span className="text-ink-faint">(you)</span>}
                </div>
                <div className="truncate text-xs text-ink-faint">{m.email}</div>
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
                  <button disabled={busy} onClick={() => confirm(`Remove ${m.name ?? m.email} from this workspace?`) && run(() => removeMemberAction(slug, m.userId))} className="rounded px-2 py-1 text-sm text-danger hover:bg-danger-soft">
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
              <button disabled={busy} onClick={() => run(() => cancelInviteAction(slug, p.id))} className="rounded px-2 py-1 text-sm text-ink-soft hover:bg-hover">
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
