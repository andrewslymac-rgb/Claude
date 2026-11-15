"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import { can, ForbiddenError } from "@/lib/permissions";
import { addLink, removeLink, moveLink, toggleStar, LINK_KINDS, type LinkKind } from "@/lib/tool-links";

type Result = { ok: true } | { ok: false; error: string };

/** Owners and admins manage both menu link lists. */
async function ownerOrAdmin(slug: string) {
  const a = await requireAccess(slug);
  if (!can(a.abilities, "view_dashboards")) throw new ForbiddenError("Only owners and admins can change these links.");
  return a;
}

export async function addLinkAction(slug: string, kind: LinkKind, label: string, url: string): Promise<Result> {
  try {
    const { workspace } = await ownerOrAdmin(slug);
    await addLink(workspace.id, z.enum(LINK_KINDS).parse(kind), label, url);
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function removeLinkAction(slug: string, kind: LinkKind, id: string): Promise<Result> {
  try {
    const { workspace } = await ownerOrAdmin(slug);
    await removeLink(workspace.id, z.enum(LINK_KINDS).parse(kind), id);
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Anyone who can see a link can star it for themselves. */
export async function toggleLinkStarAction(slug: string, linkId: string): Promise<Result> {
  try {
    const { workspace, user } = await requireAccess(slug);
    await toggleStar(user.id, workspace.id, z.string().uuid().parse(linkId));
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "That link no longer exists." : (e as Error).message };
  }
}

export async function moveLinkAction(slug: string, from: LinkKind, id: string): Promise<Result> {
  try {
    const { workspace } = await ownerOrAdmin(slug);
    await moveLink(workspace.id, z.enum(LINK_KINDS).parse(from), z.string().uuid().parse(id));
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "That link no longer exists." : (e as Error).message };
  }
}
