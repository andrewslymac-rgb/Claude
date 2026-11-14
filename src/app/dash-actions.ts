"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import { can, ForbiddenError } from "@/lib/permissions";
import { requireDashboard } from "@/lib/dash/access";
import { relock, sendUnlockCode, verifyUnlockCode } from "@/lib/dash/lock";
import { addFollowup, deleteFollowup } from "@/lib/dash/ar";
import { addToolLink, removeToolLink } from "@/lib/dash/tools";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const wrap = async (fn: () => Promise<string | void>): Promise<Result> => {
  try {
    return { ok: true, message: (await fn()) ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Please check the form and try again." : (e as Error).message };
  }
};

/** Owners and admins only, before the area is unlocked. */
async function ownerOrAdmin(slug: string) {
  const a = await requireAccess(slug);
  if (!can(a.abilities, "view_dashboards")) throw new ForbiddenError();
  return a;
}

export async function sendUnlockCodeAction(slug: string): Promise<Result> {
  return wrap(async () => {
    const { user } = await ownerOrAdmin(slug);
    const { to } = await sendUnlockCode(user);
    return `Code sent to ${to}`;
  });
}

export async function verifyUnlockCodeAction(slug: string, code: string): Promise<Result> {
  return wrap(async () => {
    await ownerOrAdmin(slug);
    await verifyUnlockCode(code);
    revalidatePath(`/w/${slug}`, "layout");
  });
}

export async function relockAction(slug: string): Promise<Result> {
  return wrap(async () => {
    await ownerOrAdmin(slug);
    await relock();
    revalidatePath(`/w/${slug}`, "layout");
  });
}

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function addArFollowupAction(slug: string, invoiceId: string, note: string, followUpOn: string | null): Promise<Result> {
  return wrap(async () => {
    const { workspace, user } = await requireDashboard(slug);
    const p = z.object({ invoiceId: z.string().min(1).max(200), note: z.string().trim().min(1, "Write a short note.").max(500), followUpOn: iso.nullable() }).safeParse({ invoiceId, note, followUpOn: followUpOn || null });
    if (!p.success) throw new Error(p.error.issues[0]?.message ?? "Check the note.");
    await addFollowup(workspace.id, p.data.invoiceId, p.data.note, p.data.followUpOn, user.id);
    revalidatePath(`/w/${slug}/dash/ar`);
  });
}

export async function deleteArFollowupAction(slug: string, id: string): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireDashboard(slug);
    await deleteFollowup(workspace.id, z.string().uuid().parse(id));
    revalidatePath(`/w/${slug}/dash/ar`);
  });
}

export async function addToolLinkAction(slug: string, label: string, url: string): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireDashboard(slug);
    await addToolLink(workspace.id, label, url);
    revalidatePath(`/w/${slug}`, "layout");
  });
}

export async function removeToolLinkAction(slug: string, id: string): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireDashboard(slug);
    await removeToolLink(workspace.id, id);
    revalidatePath(`/w/${slug}`, "layout");
  });
}
