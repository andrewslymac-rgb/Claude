"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { createRoleAction, deleteRoleAction, setRoleMembersAction, updateRoleAction } from "@/app/actions";
import type { RolePermission } from "@/db/schema";
import { BRAND_SWATCHES } from "@/lib/theme/workspace-theme";

export type RoleRow = { id: string; name: string; emoji: string; color: string; description: string; permissions: RolePermission[]; members: { id: string; name: string }[]; taskCount: number };
type Member = { id: string; name: string };
type PermInfo = Record<RolePermission, { label: string; help: string }>;

const SUGGESTIONS = ["Cleaning Specialist", "Team Lead", "Office Manager", "Technician", "Sales", "Bookkeeper", "Owner"];

export function RolesPanel({ slug, canManage, roles, members, permissionInfo }: { slug: string; canManage: boolean; roles: RoleRow[]; members: Member[]; permissionInfo: PermInfo }) {
  const [editing, setEditing] = useState<RoleRow | "new" | null>(null);
  const [assigning, setAssigning] = useState<RoleRow | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  return (
    <div className="mt-3 space-y-3 text-sm">
      {msg && <p className={`rounded-lg px-3 py-2 ${msg.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {roles.map((r) => (
          <li key={r.id} className="card p-3">
            <div className="flex items-start gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl" style={{ background: `${r.color}33`, boxShadow: `inset 0 0 0 1px ${r.color}88` }}>
                {r.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.name}</div>
                {r.description && <div className="text-xs text-ink-soft">{r.description}</div>}
                <div className="mt-1 text-xs text-ink-faint">
                  {r.taskCount} task{r.taskCount === 1 ? "" : "s"} · {r.permissions.length ? r.permissions.map((p) => permissionInfo[p]?.label ?? p).join(", ") : "no extra permissions"}
                </div>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <button onClick={() => setEditing(r)} className="rounded p-1.5 text-ink-faint hover:bg-hover hover:text-ink" title="Edit">
                    <Pencil size={13} />
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => confirm(`Delete the ${r.name} role? Its ${r.taskCount} tasks become open to anyone.`) && start(async () => setMsg(await deleteRoleAction(slug, r.id).then((x) => (x.ok ? { ok: true, text: x.message ?? "Removed." } : { ok: false, text: x.error }))))}
                    className="rounded p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {r.members.map((m) => (
                <span key={m.id} className="rounded-full bg-hover px-2 py-0.5 text-[11px]">
                  {m.name}
                </span>
              ))}
              {r.members.length === 0 && <span className="text-[11px] text-ink-faint">Nobody holds this role yet.</span>}
              {canManage && (
                <button onClick={() => setAssigning(r)} className="tap flex items-center gap-1 rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-ink-faint hover:bg-hover hover:text-ink">
                  <Users size={10} /> who
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {roles.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-ink-faint">No job roles yet. Add the roles people hold in your company, then assign tasks to them.</p>}
      {canManage && (
        <button onClick={() => setEditing("new")} className="flex items-center gap-1 btn btn-primary btn-sm">
          <Plus size={13} /> New job role
        </button>
      )}

      {editing && (
        <RoleForm
          slug={slug}
          role={editing === "new" ? null : editing}
          permissionInfo={permissionInfo}
          onClose={() => setEditing(null)}
          onDone={(t) => {
            setEditing(null);
            setMsg({ ok: true, text: t });
          }}
        />
      )}
      {assigning && (
        <AssignDialog
          role={assigning}
          members={members}
          onClose={() => setAssigning(null)}
          onSave={(ids) => {
            setAssigning(null);
            start(async () => setMsg(await setRoleMembersAction(slug, assigning.id, ids).then((x) => (x.ok ? { ok: true, text: `${assigning.name}: ${ids.length} ${ids.length === 1 ? "person" : "people"}.` } : { ok: false, text: x.error }))));
          }}
        />
      )}
    </div>
  );
}

function RoleForm({ slug, role, permissionInfo, onClose, onDone }: { slug: string; role: RoleRow | null; permissionInfo: PermInfo; onClose: () => void; onDone: (msg: string) => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [emoji, setEmoji] = useState(role?.emoji ?? "🧑‍💼");
  const [color, setColor] = useState(role?.color ?? "#6366f1");
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<RolePermission[]>(role?.permissions ?? []);
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  const toggle = (p: RolePermission) => setPerms(perms.includes(p) ? perms.filter((x) => x !== p) : [...perms, p]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <form
        className="pb-safe max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-card p-5 shadow-2xl sm:rounded-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const input = { name, emoji, color, description, permissions: perms };
            const r = role ? await updateRoleAction(slug, role.id, input) : await createRoleAction(slug, input);
            if (r.ok) onDone(r.message ?? "Saved.");
            else setErr(r.error);
          });
        }}
      >
        <h3 className="text-lg font-semibold">{role ? "Edit job role" : "New job role"}</h3>
        <div className="mt-3 flex gap-2">
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} className="w-14 rounded-lg border border-line bg-paper px-2 py-2 text-center text-lg" aria-label="Icon" />
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Role name, e.g. Team Lead" list="role-suggestions" className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          <datalist id="role-suggestions">
            {SUGGESTIONS.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </div>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role is responsible for (optional)" className="mt-2 field" />
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {BRAND_SWATCHES.map((c) => (
            <button type="button" key={c} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-offset-card" : ""}`} style={{ background: c, ["--tw-ring-color" as string]: c }} aria-label={c} />
          ))}
        </div>
        <div className="mt-4">
          <div className="text-sm font-medium">What people in this role can do in Orbit</div>
          <p className="text-xs text-ink-faint">On top of their access level (Viewer, Editor, Admin, Owner). Leave all off for a role that only organizes work.</p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {(Object.keys(permissionInfo) as RolePermission[]).map((p) => (
              <label key={p} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm ${perms.includes(p) ? "border-accent bg-accent-soft" : "border-line hover:bg-hover"}`}>
                <input type="checkbox" checked={perms.includes(p)} onChange={() => toggle(p)} className="mt-0.5" />
                <span>
                  <span className="block font-medium">{permissionInfo[p].label}</span>
                  <span className="block text-xs text-ink-faint">{permissionInfo[p].help}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        {err && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button disabled={busy || !name.trim()} className="btn btn-primary">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AssignDialog({ role, members, onClose, onSave }: { role: RoleRow; members: Member[]; onClose: () => void; onSave: (ids: string[]) => void }) {
  const [ids, setIds] = useState<string[]>(role.members.map((m) => m.id));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div className="pb-safe max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-card p-5 shadow-2xl sm:rounded-xl" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">
          Who is a {role.emoji} {role.name}?
        </h3>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {members.map((m) => {
            const on = ids.includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => setIds(on ? ids.filter((x) => x !== m.id) : [...ids, m.id])} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:bg-hover"}`}>
                {m.name}
              </button>
            );
          })}
          {members.length === 0 && <span className="text-sm text-ink-faint">Add people under People first.</span>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button onClick={() => onSave(ids)} className="btn btn-primary">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
