import "server-only";
import { z } from "zod";
import { decrypt, encrypt } from "@/lib/crypto";

/** How long an upload link works after it is made. */
export const UPLOAD_LINK_MINUTES = 60;

const Payload = z.object({ k: z.literal("task-upload"), ws: z.string().uuid(), slug: z.string(), task: z.string().uuid(), user: z.string().uuid(), exp: z.number() });
export type UploadLink = z.infer<typeof Payload>;

/**
 * A link that lets whoever holds it add files to one task for a short time, with no sign-in.
 * Made for AI tools: they can't push a photo through their connection, so they hand the person
 * (or a shell command) this link instead. The token is encrypted and signed, so it can't be
 * edited to point at another task.
 */
export function makeUploadToken(input: { workspaceId: string; slug: string; taskId: string; userId: string }) {
  const payload: UploadLink = { k: "task-upload", ws: input.workspaceId, slug: input.slug, task: input.taskId, user: input.userId, exp: Date.now() + UPLOAD_LINK_MINUTES * 60_000 };
  return encrypt(JSON.stringify(payload));
}

export function readUploadToken(token: string): UploadLink | null {
  try {
    if (!token.startsWith("v1.") || token.length > 2000) return null;
    const p = Payload.safeParse(JSON.parse(decrypt(token) ?? ""));
    if (!p.success || p.data.exp < Date.now()) return null;
    return p.data;
  } catch {
    return null;
  }
}
