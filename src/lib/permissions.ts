import type { Role, RolePermission } from "@/db/schema";

const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

export type Ability =
  | "read"
  | "edit" // pages
  | "manage_tasks" // create / edit / remove tasks (everyone can tick them off)
  | "manage_dashboard"
  | "manage_members"
  | "manage_workspace" // rename, color, delete
  | "view_sensitive"; // documents marked sensitive

const NEEDS: Record<Ability, Role> = {
  read: "viewer",
  edit: "editor",
  manage_tasks: "editor",
  manage_dashboard: "admin",
  manage_members: "admin",
  manage_workspace: "owner",
  view_sensitive: "admin",
};

export const ALL_ABILITIES = Object.keys(NEEDS) as Ability[];

/** What an access level alone allows. */
export function baseAbilities(role: Role | null | undefined): Ability[] {
  if (!role) return [];
  return ALL_ABILITIES.filter((a) => RANK[role] >= RANK[NEEDS[a]]);
}

/** Access level + anything the person's job roles add. */
export function effectiveAbilities(role: Role | null | undefined, rolePermissions: RolePermission[][] = []): Ability[] {
  const set = new Set<Ability>(baseAbilities(role));
  for (const perms of rolePermissions) for (const p of perms) set.add(p);
  return Array.from(set);
}

/** Accepts either a bare access level or a resolved ability list. */
export function can(who: Role | Ability[] | null | undefined, ability: Ability) {
  if (!who) return false;
  if (Array.isArray(who)) return who.includes(ability);
  return RANK[who] >= RANK[NEEDS[ability]];
}

export const PERMISSION_LABELS: Record<RolePermission, { label: string; help: string }> = {
  edit: { label: "Edit pages", help: "Create and change pages and documents written in Orbit" },
  manage_tasks: { label: "Manage tasks", help: "Add, edit, reassign and remove tasks (anyone can tick tasks off)" },
  manage_dashboard: { label: "Customize the dashboard", help: "Add, move and remove dashboard tiles" },
  manage_members: { label: "Manage people", help: "Add people, change access levels, assign roles" },
  manage_workspace: { label: "Workspace settings", help: "Name, color, integrations" },
  view_sensitive: { label: "See sensitive documents", help: "Documents flagged as sensitive (pay, legal)" },
};

export function outranks(a: Role, b: Role) {
  return RANK[a] > RANK[b];
}

export const ROLE_LABELS: Record<Role, { label: string; help: string }> = {
  owner: { label: "Owner", help: "Full control, including deleting the workspace" },
  admin: { label: "Admin", help: "Manage people, the dashboard and connections" },
  editor: { label: "Editor", help: "Create and edit pages and tasks" },
  viewer: { label: "Viewer", help: "Read only" },
};

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}
