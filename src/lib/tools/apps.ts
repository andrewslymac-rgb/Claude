import type { Role } from "@/db/schema";

/**
 * Tools built into Orbit for one company. They show in the menu for every member of that
 * company and nowhere else. The owner-managed tool links are separate (lib/dash/tools).
 */
export type BuiltInApp = { id: "tracker"; label: string; blurb: string; emoji: string };

const ADAPT = "adapt-pest-pros";
/** The shared inbox the Adapt tools read and draft in. */
export const ADAPT_MAILBOX = "info@adaptpestpros.com";

const APPS: Record<string, BuiltInApp[]> = {
  [ADAPT]: [{ id: "tracker", label: "Compliance Tracker", blurb: "Property managers, locations, compliance and vendor portals.", emoji: "📋" }],
};

export function builtInApps(workspaceSlug: string): BuiltInApp[] {
  return APPS[workspaceSlug] ?? [];
}

const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
/**
 * Who can do what in a built-in tool. Goes by access level only, so a job role's
 * permissions never widen it: everyone in the company can look, editors and up can
 * change records, admins and owners change settings and run imports.
 */
export const toolLevel = (role: Role) => ({ canEdit: RANK[role] >= RANK.editor, canAdmin: RANK[role] >= RANK.admin });
