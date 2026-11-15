"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/access";
import { can, ForbiddenError } from "@/lib/permissions";
import { addToolLink, removeToolLink } from "@/lib/tool-links";

type Result = { ok: true } | { ok: false; error: string };

/** Owners and admins manage the Tools links. */
async function ownerOrAdmin(slug: string) {
  const a = await requireAccess(slug);
  if (!can(a.abilities, "view_dashboards")) throw new ForbiddenError();
  return a;
}

export async function addToolLinkAction(slug: string, label: string, url: string): Promise<Result> {
  try {
    const { workspace } = await ownerOrAdmin(slug);
    await addToolLink(workspace.id, label, url);
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function removeToolLinkAction(slug: string, id: string): Promise<Result> {
  try {
    const { workspace } = await ownerOrAdmin(slug);
    await removeToolLink(workspace.id, id);
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
