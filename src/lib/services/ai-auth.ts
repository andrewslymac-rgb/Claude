import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AiScope } from "@/db/schema";

const { aiClients, aiGrants, aiAuthCodes, aiTokens, aiActivity, workspaces, users } = schema;

export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const token = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;

const ACCESS_HOURS = 24;
const REFRESH_DAYS = 90;
const CODE_MINUTES = 10;

export const SCOPE_LABELS: Record<AiScope, { label: string; help: string }> = {
  read: { label: "Read", help: "Search and read pages, SOPs, tasks and the dashboard" },
  "write:pages": { label: "Edit pages", help: "Create pages and change page content (every change is tracked and can be undone)" },
  "write:tasks": { label: "Manage tasks", help: "Create tasks and mark them done" },
};

export function parseScopes(raw: string | null | undefined): AiScope[] {
  const want = (raw ?? "").split(/[\s,]+/).filter(Boolean);
  const valid = want.filter((s): s is AiScope => (schema.AI_SCOPES as readonly string[]).includes(s));
  return valid.length ? Array.from(new Set(["read", ...valid])) as AiScope[] : ["read"];
}

// ---------------------------------------------------------------- clients (dynamic registration)

export async function registerClient(input: { name: string; redirectUris: string[]; wantsSecret: boolean }) {
  const id = `orbit_${randomBytes(12).toString("hex")}`;
  const secret = input.wantsSecret ? token("secret") : null;
  await db.insert(aiClients).values({ id, name: input.name.slice(0, 120), redirectUris: input.redirectUris, secretHash: secret ? hash(secret) : null });
  return { id, secret };
}

export async function getClient(id: string) {
  const [c] = await db.select().from(aiClients).where(eq(aiClients.id, id));
  return c ?? null;
}

// ---------------------------------------------------------------- grants

export async function createGrant(input: { workspaceId: string; userId: string; clientId?: string | null; name: string; scopes: AiScope[] }) {
  const [g] = await db.insert(aiGrants).values({ ...input, clientId: input.clientId ?? null }).returning();
  return g;
}

export async function listGrants(workspaceId: string) {
  return db
    .select({ id: aiGrants.id, name: aiGrants.name, scopes: aiGrants.scopes, createdAt: aiGrants.createdAt, lastUsedAt: aiGrants.lastUsedAt, revokedAt: aiGrants.revokedAt, clientName: aiClients.name, userName: users.name })
    .from(aiGrants)
    .leftJoin(aiClients, eq(aiClients.id, aiGrants.clientId))
    .leftJoin(users, eq(users.id, aiGrants.userId))
    .where(eq(aiGrants.workspaceId, workspaceId))
    .orderBy(desc(aiGrants.createdAt));
}

export async function revokeGrant(workspaceId: string, id: string) {
  await db.update(aiGrants).set({ revokedAt: new Date() }).where(and(eq(aiGrants.workspaceId, workspaceId), eq(aiGrants.id, id)));
  await db.update(aiTokens).set({ revokedAt: new Date() }).where(eq(aiTokens.grantId, id));
}

// ---------------------------------------------------------------- authorization codes + tokens

export async function issueAuthCode(input: { grantId: string; clientId: string; redirectUri: string; codeChallenge: string }) {
  const code = token("code");
  await db.insert(aiAuthCodes).values({ id: hash(code), ...input, expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) });
  return code;
}

export async function issueTokens(grantId: string) {
  const access = token("orb");
  const refresh = token("orbr");
  await db.insert(aiTokens).values([
    { id: hash(access), grantId, kind: "access", expiresAt: new Date(Date.now() + ACCESS_HOURS * 3600_000) },
    { id: hash(refresh), grantId, kind: "refresh", expiresAt: new Date(Date.now() + REFRESH_DAYS * 864e5) },
  ]);
  return { access, refresh, expiresIn: ACCESS_HOURS * 3600 };
}

/** A manual API key: a long-lived access token shown once. */
export async function issueApiKey(grantId: string) {
  const key = token("orbk");
  await db.insert(aiTokens).values({ id: hash(key), grantId, kind: "access", expiresAt: null });
  return key;
}

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const pkceOk = (verifier: string, challenge: string) => createHash("sha256").update(verifier).digest("base64url") === challenge;

export async function exchangeCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string }) {
  const [row] = await db.select().from(aiAuthCodes).where(eq(aiAuthCodes.id, hash(input.code)));
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new OAuthError("invalid_grant", "Code is invalid or expired");
  if (row.clientId !== input.clientId || row.redirectUri !== input.redirectUri) throw new OAuthError("invalid_grant", "Client or redirect mismatch");
  if (!pkceOk(input.codeVerifier, row.codeChallenge)) throw new OAuthError("invalid_grant", "PKCE verification failed");
  await db.update(aiAuthCodes).set({ usedAt: new Date() }).where(eq(aiAuthCodes.id, row.id));
  return issueTokens(row.grantId);
}

export async function refreshTokens(refreshToken: string, clientId: string) {
  const [row] = await db.select({ t: aiTokens, g: aiGrants }).from(aiTokens).innerJoin(aiGrants, eq(aiGrants.id, aiTokens.grantId)).where(eq(aiTokens.id, hash(refreshToken)));
  if (!row || row.t.kind !== "refresh" || row.t.revokedAt || (row.t.expiresAt && row.t.expiresAt < new Date())) throw new OAuthError("invalid_grant", "Refresh token is invalid");
  if (row.g.revokedAt) throw new OAuthError("invalid_grant", "Access was revoked");
  if (row.g.clientId && row.g.clientId !== clientId) throw new OAuthError("invalid_grant", "Client mismatch");
  await db.update(aiTokens).set({ revokedAt: new Date() }).where(eq(aiTokens.id, row.t.id)); // rotate
  return issueTokens(row.g.id);
}

export type AiPrincipal = { grantId: string; workspaceId: string; workspaceSlug: string; workspaceName: string; userId: string; name: string; scopes: AiScope[] };

/** Validates a bearer token and returns who it is. Null if invalid. */
export async function authenticate(bearer: string | null): Promise<AiPrincipal | null> {
  if (!bearer) return null;
  const [row] = await db
    .select({ t: aiTokens, g: aiGrants, ws: workspaces })
    .from(aiTokens)
    .innerJoin(aiGrants, eq(aiGrants.id, aiTokens.grantId))
    .innerJoin(workspaces, eq(workspaces.id, aiGrants.workspaceId))
    .where(and(eq(aiTokens.id, hash(bearer)), eq(aiTokens.kind, "access"), isNull(aiTokens.revokedAt)));
  if (!row || row.g.revokedAt || (row.t.expiresAt && row.t.expiresAt < new Date())) return null;
  await db.update(aiGrants).set({ lastUsedAt: new Date() }).where(eq(aiGrants.id, row.g.id));
  return { grantId: row.g.id, workspaceId: row.ws.id, workspaceSlug: row.ws.slug, workspaceName: row.ws.name, userId: row.g.userId, name: row.g.name, scopes: row.g.scopes };
}

// ---------------------------------------------------------------- activity

export async function logActivity(input: { workspaceId: string; grantId: string; tool: string; summary: string; pageId?: string | null; taskId?: string | null; undoVersionId?: string | null }) {
  await db.insert(aiActivity).values(input);
}

export async function listActivity(workspaceId: string, limit = 50) {
  return db
    .select({
      id: aiActivity.id,
      tool: aiActivity.tool,
      summary: aiActivity.summary,
      pageId: aiActivity.pageId,
      taskId: aiActivity.taskId,
      undoVersionId: aiActivity.undoVersionId,
      undoneAt: aiActivity.undoneAt,
      createdAt: aiActivity.createdAt,
      grantName: aiGrants.name,
    })
    .from(aiActivity)
    .leftJoin(aiGrants, eq(aiGrants.id, aiActivity.grantId))
    .where(eq(aiActivity.workspaceId, workspaceId))
    .orderBy(desc(aiActivity.createdAt))
    .limit(limit);
}

export async function markUndone(workspaceId: string, id: string) {
  await db.update(aiActivity).set({ undoneAt: new Date() }).where(and(eq(aiActivity.workspaceId, workspaceId), eq(aiActivity.id, id)));
}

export async function getActivity(workspaceId: string, id: string) {
  const [a] = await db.select().from(aiActivity).where(and(eq(aiActivity.workspaceId, workspaceId), eq(aiActivity.id, id)));
  return a ?? null;
}
