import type { Role } from "@/db/schema";

const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

export type Ability =
  | "read"
  | "edit" // pages, tasks
  | "manage_dashboard"
  | "manage_members"
  | "manage_workspace"; // rename, color, delete

const NEEDS: Record<Ability, Role> = {
  read: "viewer",
  edit: "editor",
  manage_dashboard: "admin",
  manage_members: "admin",
  manage_workspace: "owner",
};

export function can(role: Role | null | undefined, ability: Ability) {
  if (!role) return false;
  return RANK[role] >= RANK[NEEDS[ability]];
}

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
