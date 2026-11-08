import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/services/app-settings";
import { appUrl } from "@/lib/oauth-meta";

const { integrations } = schema;

export const JOBBER_ID_SETTING = "jobber_client_id";
export const JOBBER_SECRET_SETTING = "jobber_client_secret";
const AUTH_URL = "https://api.getjobber.com/api/oauth/authorize";
const TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
const GRAPHQL_URL = "https://api.getjobber.com/api/graphql";
/** Jobber versions its GraphQL schema by date. Override with JOBBER_GRAPHQL_VERSION if Jobber retires this one. */
const GRAPHQL_VERSION = process.env.JOBBER_GRAPHQL_VERSION ?? "2026-05-12";

export const redirectUri = () => `${appUrl()}/api/integrations/jobber/callback`;

export async function jobberAppConfig() {
  const clientId = (await getSetting(JOBBER_ID_SETTING)) ?? process.env.JOBBER_CLIENT_ID ?? null;
  const clientSecret = (await getSetting(JOBBER_SECRET_SETTING)) ?? process.env.JOBBER_CLIENT_SECRET ?? null;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export async function authorizeUrl(state: string) {
  const cfg = await jobberAppConfig();
  if (!cfg) throw new Error("Jobber isn't set up yet. An app admin pastes the Jobber app's client ID and secret in Settings → Integrations.");
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  return u.toString();
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; expires_at?: number };

async function tokenRequest(body: Record<string, string>) {
  const cfg = await jobberAppConfig();
  if (!cfg) throw new Error("Jobber app credentials are missing.");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Jobber token request failed (${res.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text) as TokenResponse;
}

const expiry = (t: TokenResponse) => (t.expires_at ? new Date(t.expires_at * 1000) : new Date(Date.now() + (t.expires_in ?? 3600) * 1000));

/** Finish the OAuth dance and remember the connection for this company. */
export async function completeConnect(workspaceId: string, code: string, userId: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  await db
    .insert(integrations)
    .values({ workspaceId, provider: "jobber", accessToken: t.access_token, refreshToken: t.refresh_token ?? null, expiresAt: expiry(t), connectedById: userId })
    .onConflictDoUpdate({ target: [integrations.workspaceId, integrations.provider], set: { accessToken: t.access_token, refreshToken: t.refresh_token ?? null, expiresAt: expiry(t), connectedById: userId, lastError: null, updatedAt: new Date() } });
  // Learn the account name so Settings can show it.
  try {
    const d = await gql<{ account: { name: string } }>(workspaceId, `query { account { name } }`);
    await db.update(integrations).set({ accountName: d.account.name }).where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, "jobber")));
  } catch (e) {
    await db.update(integrations).set({ lastError: (e as Error).message.slice(0, 300) }).where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, "jobber")));
  }
}

export async function getIntegration(workspaceId: string, provider = "jobber") {
  const [row] = await db.select().from(integrations).where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, provider)));
  return row ?? null;
}

export async function disconnect(workspaceId: string, provider = "jobber") {
  await db.delete(integrations).where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, provider)));
  snapshots.delete(workspaceId);
}

async function accessToken(workspaceId: string) {
  const row = await getIntegration(workspaceId);
  if (!row) throw new Error("Jobber isn't connected for this company.");
  if (row.expiresAt && row.expiresAt.getTime() - Date.now() > 60_000) return row.accessToken;
  if (!row.refreshToken) throw new Error("Jobber session expired. Reconnect in Settings → Integrations.");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: row.refreshToken });
  await db
    .update(integrations)
    .set({ accessToken: t.access_token, refreshToken: t.refresh_token ?? row.refreshToken, expiresAt: expiry(t), lastError: null, updatedAt: new Date() })
    .where(eq(integrations.id, row.id));
  return t.access_token;
}

export async function gql<T>(workspaceId: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = await accessToken(workspaceId);
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-JOBBER-GRAPHQL-VERSION": GRAPHQL_VERSION },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
  if (!res.ok) throw new Error(`Jobber API ${res.status}: ${json.errors?.map((e) => e.message).join("; ") ?? "request failed"}`);
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data as T;
}

// ---------------------------------------------------------------------------
// Dashboard snapshot: today's visits, new requests, quotes waiting, overdue invoices.
// Each section runs on its own so one schema hiccup doesn't blank the whole tile.
// ---------------------------------------------------------------------------

export type Visit = { id: string; title: string; startAt: string; endAt: string | null; completed: boolean; client: string; address: string; assignees: string[] };
export type Snapshot = {
  at: string;
  account: string | null;
  today: Visit[];
  requestsNew: number;
  quotesAwaiting: { count: number; total: number };
  invoicesPastDue: { count: number; total: number };
  invoicesAwaiting: { count: number; total: number };
  errors: string[];
};

const snapshots = new Map<string, { at: number; data: Snapshot }>();
const TTL = 3 * 60_000;

const TZ = "America/Los_Angeles";
function dayBounds() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  // Pacific day as UTC instants (DST-safe enough for a dashboard: compute offset from the date).
  const probe = new Date(`${today}T12:00:00Z`);
  const local = new Date(probe.toLocaleString("en-US", { timeZone: TZ }));
  const offsetMin = (probe.getTime() - local.getTime()) / 60000;
  const start = new Date(new Date(`${today}T00:00:00Z`).getTime() + offsetMin * 60000);
  const end = new Date(start.getTime() + 864e5);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Token value that marks a connection fed by Claude's daily push instead of OAuth. */
export const MANUAL_TOKEN = "manual";

export type ManualSnapshot = Omit<Snapshot, "at" | "account" | "errors"> & { note?: string };

/**
 * Store numbers pushed in from outside (Claude's scheduled task reads Jobber through
 * its own connector and calls the Orbit MCP tool). Shown on the tile until the next push.
 */
export async function storeSnapshot(workspaceId: string, data: ManualSnapshot, source: string, userId: string | null) {
  const snap: Snapshot = { at: new Date().toISOString(), account: null, errors: [], today: data.today, requestsNew: data.requestsNew, quotesAwaiting: data.quotesAwaiting, invoicesPastDue: data.invoicesPastDue, invoicesAwaiting: data.invoicesAwaiting };
  const existing = await getIntegration(workspaceId);
  if (existing && existing.accessToken !== MANUAL_TOKEN) {
    // OAuth is live; keep it, just remember the push too.
    await db.update(integrations).set({ meta: { ...existing.meta, snapshot: snap, source, note: data.note ?? null }, updatedAt: new Date() }).where(eq(integrations.id, existing.id));
  } else {
    await db
      .insert(integrations)
      .values({ workspaceId, provider: "jobber", accessToken: MANUAL_TOKEN, accountName: source, meta: { snapshot: snap, source, note: data.note ?? null }, connectedById: userId })
      .onConflictDoUpdate({ target: [integrations.workspaceId, integrations.provider], set: { accountName: source, meta: { snapshot: snap, source, note: data.note ?? null }, lastError: null, updatedAt: new Date() } });
  }
  snapshots.delete(workspaceId);
  return snap;
}

export async function snapshot(workspaceId: string, force = false): Promise<Snapshot> {
  const c = snapshots.get(workspaceId);
  if (c && !force && Date.now() - c.at < TTL) return c.data;
  const row = await getIntegration(workspaceId);
  const out: Snapshot = { at: new Date().toISOString(), account: row?.accountName ?? null, today: [], requestsNew: 0, quotesAwaiting: { count: 0, total: 0 }, invoicesPastDue: { count: 0, total: 0 }, invoicesAwaiting: { count: 0, total: 0 }, errors: [] };
  if (!row) return out;
  if (row.accessToken === MANUAL_TOKEN) {
    const stored = row.meta.snapshot as Snapshot | undefined;
    const data: Snapshot = stored ? { ...stored, account: row.accountName, errors: [] } : { ...out, errors: ["No numbers pushed yet."] };
    snapshots.set(workspaceId, { at: Date.now(), data });
    return data;
  }
  const { start, end } = dayBounds();

  const run = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      out.errors.push(`${label}: ${(e as Error).message.slice(0, 160)}`);
    }
  };

  await run("Today's visits", async () => {
    type R = { visits: { nodes: { id: string; title: string; startAt: string; endAt: string | null; isComplete: boolean; client: { name: string } | null; property: { address: { street: string | null; city: string | null } | null } | null; assignedUsers: { nodes: { name: { full: string } }[] } }[] } };
    const d = await gql<R>(
      workspaceId,
      `query ($after: ISO8601DateTime!, $before: ISO8601DateTime!) {
        visits(filter: { startAt: { after: $after, before: $before } }, first: 50, sort: { key: START_AT, direction: ASCENDING }) {
          nodes { id title startAt endAt isComplete client { name } property { address { street city } } assignedUsers { nodes { name { full } } } }
        }
      }`,
      { after: start, before: end },
    );
    out.today = d.visits.nodes.map((v) => ({
      id: v.id,
      title: v.title,
      startAt: v.startAt,
      endAt: v.endAt,
      completed: v.isComplete,
      client: v.client?.name ?? "",
      address: [v.property?.address?.street, v.property?.address?.city].filter(Boolean).join(", "),
      assignees: v.assignedUsers.nodes.map((u) => u.name.full),
    }));
  });

  await run("New requests", async () => {
    const d = await gql<{ requests: { totalCount: number } }>(workspaceId, `query { requests(filter: { status: NEW }) { totalCount } }`);
    out.requestsNew = d.requests.totalCount;
  });

  await run("Quotes awaiting", async () => {
    const d = await gql<{ quotes: { totalCount: number; nodes: { amounts: { total: number } }[] } }>(workspaceId, `query { quotes(filter: { status: AWAITING_RESPONSE }, first: 100) { totalCount nodes { amounts { total } } } }`);
    out.quotesAwaiting = { count: d.quotes.totalCount, total: d.quotes.nodes.reduce((s, q) => s + (q.amounts?.total ?? 0), 0) };
  });

  await run("Overdue invoices", async () => {
    const d = await gql<{ invoices: { totalCount: number; nodes: { amounts: { invoiceBalance: number } }[] } }>(workspaceId, `query { invoices(filter: { invoiceStatus: PAST_DUE }, first: 100) { totalCount nodes { amounts { invoiceBalance } } } }`);
    out.invoicesPastDue = { count: d.invoices.totalCount, total: d.invoices.nodes.reduce((s, i) => s + (i.amounts?.invoiceBalance ?? 0), 0) };
  });

  await run("Unpaid invoices", async () => {
    const d = await gql<{ invoices: { totalCount: number; nodes: { amounts: { invoiceBalance: number } }[] } }>(workspaceId, `query { invoices(filter: { invoiceStatus: AWAITING_PAYMENT }, first: 100) { totalCount nodes { amounts { invoiceBalance } } } }`);
    out.invoicesAwaiting = { count: d.invoices.totalCount, total: d.invoices.nodes.reduce((s, i) => s + (i.amounts?.invoiceBalance ?? 0), 0) };
  });

  if (out.errors.length) await db.update(integrations).set({ lastError: out.errors.join(" | ").slice(0, 500) }).where(eq(integrations.id, row.id));
  snapshots.set(workspaceId, { at: Date.now(), data: out });
  return out;
}
