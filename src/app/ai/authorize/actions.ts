"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { createGrant, getClient, issueAuthCode, parseScopes } from "@/lib/services/ai-auth";
import type { Role } from "@/db/schema";

export async function approveAction(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const workspaceId = String(form.get("workspace_id") ?? "");
  const scopes = parseScopes(form.getAll("scopes").map(String).join(" "));

  const client = await getClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri) || !codeChallenge) throw new Error("Invalid request");

  // The person must be an admin or owner of the chosen company.
  const [m] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.workspaceId, workspaceId), eq(schema.memberships.userId, user.id)));
  const role: Role | null = m?.role ?? (user.isAppAdmin ? "owner" : null);
  if (!can(role, "manage_members")) throw new Error("Admin access needed");

  const grant = await createGrant({ workspaceId, userId: user.id, clientId, name: client.name, scopes });
  const code = await issueAuthCode({ grantId: grant.id, clientId, redirectUri, codeChallenge });
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  redirect(url.toString());
}
