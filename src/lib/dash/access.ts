import "server-only";
import { notFound } from "next/navigation";
import { requireWorkspacePage, requireAccess } from "@/lib/access";
import { can, ForbiddenError } from "@/lib/permissions";
import { isUnlocked } from "./lock";

/**
 * For dashboard pages. Anyone below admin gets a plain 404, so the area doesn't even
 * admit it exists. Owners and admins get `unlocked: false` until they enter an emailed code.
 */
export async function dashboardPage(slug: string) {
  const access = await requireWorkspacePage(slug);
  if (!can(access.abilities, "view_dashboards")) notFound();
  return { ...access, unlocked: await isUnlocked() };
}

/** For server actions and API routes: owner or admin, with the area unlocked on this device. */
export async function requireDashboard(slug: string) {
  const access = await requireAccess(slug);
  if (!can(access.abilities, "view_dashboards")) throw new ForbiddenError();
  if (!(await isUnlocked())) throw new ForbiddenError("Your dashboards are locked. Enter the emailed code to open them.");
  return access;
}
