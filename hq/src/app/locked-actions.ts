"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAbility } from "@/lib/access";
import { can } from "@/lib/permissions";
import * as locked from "@/lib/locked-links";

type Result = { ok: true } | { ok: false; error: string };

/** Locked Links are for owners and admins, and each person only ever reaches their own. */
async function ctx(slug: string) {
  const a = await requireAbility(slug, "read");
  if (!can(a.abilities, "view_dashboards")) throw new Error("Locked Links are for owners and admins.");
  return a;
}
async function run(slug: string, fn: (c: Awaited<ReturnType<typeof ctx>>) => Promise<void>): Promise<Result> {
  try {
    await fn(await ctx(slug));
    revalidatePath(`/w/${slug}/locked`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Please check what you typed." : (e as Error).message };
  }
}
const pinArg = z.string().max(20);
const linkArg = z.object({ label: z.string().max(200), url: z.string().min(1).max(2100), description: z.string().max(400).optional() });
type LinkInput = z.infer<typeof linkArg>;

export async function setLockedPinAction(slug: string, pin: string) {
  return run(slug, ({ user }) => locked.setPin(user.id, pinArg.parse(pin)));
}
export async function unlockLockedAction(slug: string, pin: string) {
  return run(slug, ({ user }) => locked.unlock(user.id, pinArg.parse(pin)));
}
export async function lockLockedAction(slug: string) {
  return run(slug, () => locked.lock());
}
export async function resetLockedAction(slug: string) {
  return run(slug, ({ user }) => locked.resetEverything(user.id));
}
export async function addLockedLinkAction(slug: string, input: LinkInput) {
  return run(slug, ({ user, workspace }) => locked.addLocked(workspace.id, user.id, linkArg.parse(input)));
}
export async function updateLockedLinkAction(slug: string, id: string, input: LinkInput) {
  return run(slug, ({ user, workspace }) => locked.updateLocked(workspace.id, user.id, z.string().uuid().parse(id), linkArg.parse(input)));
}
export async function takeOutLockedLinkAction(slug: string, id: string) {
  return run(slug, ({ user, workspace }) => locked.takeOutLocked(workspace.id, user.id, z.string().uuid().parse(id)));
}
