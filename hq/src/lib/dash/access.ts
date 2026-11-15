import "server-only";
import { notFound } from "next/navigation";
import { requireWorkspacePage, requireAccess } from "@/lib/access";
import { can, ForbiddenError } from "@/lib/permissions";

/** For dashboard pages: owners and admins only. Anyone else gets a plain 404, so the area doesn't admit it exists. */
export async function dashboardPage(slug: string) {
  const access = await requireWorkspacePage(slug);
  if (!can(access.abilities, "view_dashboards")) notFound();
  return access;
}

/** For server actions and API routes: owners and admins only. */
export async function requireDashboard(slug: string) {
  const access = await requireAccess(slug);
  if (!can(access.abilities, "view_dashboards")) throw new ForbiddenError();
  return access;
}
