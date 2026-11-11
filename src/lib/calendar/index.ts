import "server-only";
import { and, eq } from "drizzle-orm";
import { Google } from "arctic";
import { db, schema } from "@/db";
import type { CalendarConnection } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { appUrl } from "@/lib/oauth-meta";
import { fetchIcalEvents } from "./ical";

const { calendarConnections } = schema;
export const TZ = "America/Los_Angeles";

export type CalEvent = {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  location?: string;
  link?: string;
  calendar: string;
  color?: string;
  connectionId: string;
};
export type CalendarFeed = {
  connections: { id: string; provider: string; label: string; color: string | null; error: string | null }[];
  events: CalEvent[];
  from: string;
  to: string;
  fetchedAt: string;
};

// ------------------------------------------------------------------ Google OAuth

export const googleCalendarEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const googleRedirect = () => `${appUrl()}/api/calendar/google/callback`;
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"];
export const googleCal = () => new Google(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!, googleRedirect());

export async function saveGoogleConnection(userId: string, t: { accessToken: string; refreshToken: string | null; expiresAt: Date; email: string }) {
  // One Google account per person: reconnecting the same email replaces the old row.
  const existing = await db.select().from(calendarConnections).where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "google"), eq(calendarConnections.label, t.email)));
  const values = { accessToken: encrypt(t.accessToken), refreshToken: t.refreshToken ? encrypt(t.refreshToken) : existing[0]?.refreshToken ?? null, expiresAt: t.expiresAt, lastError: null };
  if (existing[0]) await db.update(calendarConnections).set(values).where(eq(calendarConnections.id, existing[0].id));
  else await db.insert(calendarConnections).values({ userId, provider: "google", label: t.email, color: "#4285f4", ...values });
  cache.delete(userId);
}

export async function addIcalConnection(userId: string, url: string, label: string, color?: string) {
  const u = url.trim().replace(/^webcal:\/\//i, "https://");
  if (!/^https?:\/\//i.test(u)) throw new Error("Paste the feed address (it starts with https:// or webcal://).");
  // Make sure it's really a calendar before saving it.
  await fetchIcalEvents(u, new Date(), new Date(Date.now() + 864e5));
  const [row] = await db.insert(calendarConnections).values({ userId, provider: "ical", label: label.trim() || "Calendar feed", icalUrl: encrypt(u), color: color ?? "#0ea5e9" }).returning();
  cache.delete(userId);
  return row;
}

export async function listConnections(userId: string) {
  return db.select().from(calendarConnections).where(eq(calendarConnections.userId, userId));
}

export async function removeConnection(userId: string, id: string) {
  await db.delete(calendarConnections).where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.id, id)));
  cache.delete(userId);
}

export async function updateConnection(userId: string, id: string, patch: { label?: string; color?: string; calendarIds?: string[] }) {
  await db.update(calendarConnections).set(patch).where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.id, id)));
  cache.delete(userId);
}

// ------------------------------------------------------------------ Google events

async function googleToken(c: CalendarConnection) {
  const expiresSoon = !c.expiresAt || c.expiresAt.getTime() - Date.now() < 60_000;
  if (!expiresSoon) return decrypt(c.accessToken)!;
  const refresh = decrypt(c.refreshToken);
  if (!refresh) throw new Error("Google needs you to reconnect this calendar.");
  const t = await googleCal().refreshAccessToken(refresh);
  const accessToken = t.accessToken();
  await db.update(calendarConnections).set({ accessToken: encrypt(accessToken), expiresAt: t.accessTokenExpiresAt() }).where(eq(calendarConnections.id, c.id));
  return accessToken;
}

type GEvent = { id: string; status?: string; summary?: string; location?: string; htmlLink?: string; start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string }; attendees?: { self?: boolean; responseStatus?: string }[] };

async function gget(token: string, url: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error("Google signed this calendar out. Reconnect it.");
  if (res.status === 403) throw new Error("Google refused: the Calendar API may be off for this app, or access was revoked.");
  if (!res.ok) throw new Error(`Google Calendar said ${res.status}.`);
  return res.json();
}

async function googleEvents(c: CalendarConnection, from: Date, to: Date): Promise<CalEvent[]> {
  const token = await googleToken(c);
  const list = (await gget(token, "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader")) as { items?: { id: string; summary: string; selected?: boolean; backgroundColor?: string; primary?: boolean }[] };
  const wanted = (list.items ?? []).filter((cal) => (c.calendarIds.length ? c.calendarIds.includes(cal.id) : cal.selected !== false)).slice(0, 10);
  const out: CalEvent[] = [];
  await Promise.all(
    wanted.map(async (cal) => {
      const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "150" });
      const j = (await gget(token, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${q}`)) as { items?: GEvent[] };
      for (const e of j.items ?? []) {
        if (e.status === "cancelled") continue;
        if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
        const allDay = Boolean(e.start.date);
        out.push({
          id: `${c.id}:${e.id}`,
          title: e.summary?.trim() || "(No title)",
          start: allDay ? `${e.start.date}T00:00:00` : e.start.dateTime!,
          end: allDay ? `${e.end.date}T00:00:00` : e.end.dateTime!,
          allDay,
          location: e.location,
          link: e.htmlLink,
          calendar: cal.primary ? c.label : cal.summary,
          color: cal.primary ? (c.color ?? undefined) : cal.backgroundColor,
          connectionId: c.id,
        });
      }
    }),
  );
  return out;
}

// ------------------------------------------------------------------ Feed for the widget

const cache = new Map<string, { at: number; days: number; feed: CalendarFeed }>();
const CACHE_MS = 2 * 60_000;

/** Everything on this person's calendars from the start of today for N days. Never throws: errors come back per connection. */
export async function calendarFeed(userId: string, days = 7, force = false): Promise<CalendarFeed> {
  const hit = cache.get(userId);
  if (!force && hit && hit.days === days && Date.now() - hit.at < CACHE_MS) return hit.feed;

  const todayLocal = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const from = new Date(`${todayLocal}T00:00:00-08:00`); // start of today, Pacific (DST drift is harmless at midnight)
  const to = new Date(from.getTime() + days * 864e5);
  const conns = await listConnections(userId);
  const feed: CalendarFeed = { connections: [], events: [], from: from.toISOString(), to: to.toISOString(), fetchedAt: new Date().toISOString() };

  await Promise.all(
    conns.map(async (c) => {
      let error: string | null = null;
      try {
        const evs = c.provider === "google" ? await googleEvents(c, from, to) : await fetchIcalEvents(decrypt(c.icalUrl)!, from, to, c);
        feed.events.push(...evs);
        await db.update(calendarConnections).set({ lastSyncAt: new Date(), lastError: null }).where(eq(calendarConnections.id, c.id));
      } catch (e) {
        error = (e as Error).message.slice(0, 200);
        await db.update(calendarConnections).set({ lastError: error }).where(eq(calendarConnections.id, c.id));
      }
      feed.connections.push({ id: c.id, provider: c.provider, label: c.label, color: c.color, error });
    }),
  );
  feed.events.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  cache.set(userId, { at: Date.now(), days, feed });
  return feed;
}

export const forgetCalendarCache = (userId: string) => cache.delete(userId);
