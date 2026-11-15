import "server-only";
import { notFound } from "next/navigation";
import { requireWorkspacePage, requireAccess } from "@/lib/access";
import { ForbiddenError } from "@/lib/permissions";
import { builtInApps, toolLevel, type AppId } from "./apps";

/** For pages: 404 unless this company has the tool and the person is a member. */
export async function toolPage(slug: string, appId: AppId) {
  const access = await requireWorkspacePage(slug);
  const app = builtInApps(access.workspace.slug).find((a) => a.id === appId);
  if (!app) notFound();
  return { ...access, app, ...toolLevel(access.role) };
}

/** For API routes: throws unless the company has the tool and the person has the level asked for. */
export async function requireTool(slug: string, appId: AppId, need: "view" | "edit" | "admin" = "view") {
  const access = await requireAccess(slug);
  if (!builtInApps(access.workspace.slug).some((a) => a.id === appId)) throw new ForbiddenError("That tool isn't available here.");
  const level = toolLevel(access.role);
  if (need === "edit" && !level.canEdit) throw new ForbiddenError("You have view-only access.");
  if (need === "admin" && !level.canAdmin) throw new ForbiddenError("Only owners and admins can change this.");
  return { ...access, ...level };
}
