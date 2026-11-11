import "server-only";
import ical, { type VEvent } from "node-ical";
import type { CalendarConnection } from "@/db/schema";
import type { CalEvent } from "./index";

const isAllDay = (d: Date & { dateOnly?: boolean }) => Boolean(d.dateOnly);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** Reads an iCal/ICS feed (Outlook, Apple, Google "secret address", anything) and expands repeats inside the window. */
export async function fetchIcalEvents(url: string, from: Date, to: Date, c?: Pick<CalendarConnection, "id" | "label" | "color">): Promise<CalEvent[]> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": "Orbit calendar" }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("Couldn't reach that address. Check the link, or try again in a minute.");
  }
  if (!res.ok) throw new Error(`The feed address answered ${res.status}. Check the link is still published.`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("That address isn't a calendar feed (no VCALENDAR inside).");
  const data = ical.sync.parseICS(text);
  const out: CalEvent[] = [];
  const push = (ev: VEvent, start: Date, end: Date, key: string) => {
    const allDay = isAllDay(ev.start as Date & { dateOnly?: boolean });
    out.push({
      id: `${c?.id ?? "ical"}:${ev.uid ?? key}:${start.getTime()}`,
      title: (typeof ev.summary === "string" ? ev.summary : (ev.summary as { val?: string })?.val)?.trim() || "(No title)",
      start: allDay ? `${dateOnly(start)}T00:00:00` : start.toISOString(),
      end: allDay ? `${dateOnly(end)}T00:00:00` : end.toISOString(),
      allDay,
      location: typeof ev.location === "string" ? ev.location : undefined,
      link: typeof ev.url === "string" ? ev.url : undefined,
      calendar: c?.label ?? "Calendar",
      color: c?.color ?? undefined,
      connectionId: c?.id ?? "ical",
    });
  };

  for (const [key, item] of Object.entries(data)) {
    if (!item || item.type !== "VEVENT") continue;
    const ev = item as VEvent;
    if (!ev.start) continue;
    const dur = ev.end ? ev.end.getTime() - ev.start.getTime() : 3600_000;
    if (ev.rrule) {
      const dates = ev.rrule.between(new Date(from.getTime() - dur), to, true);
      const exdates = new Set(Object.values(ev.exdate ?? {}).map((d) => (d as Date).toISOString().slice(0, 16)));
      for (const d of dates) {
        // A recurrence can be overridden by its own VEVENT (moved/renamed); node-ical puts those under `recurrences`.
        const override = ev.recurrences?.[d.toISOString().slice(0, 10)] as VEvent | undefined;
        if (override) {
          if (override.start && override.start < to && new Date(override.start.getTime() + dur) > from) push(override, override.start, override.end ?? new Date(override.start.getTime() + dur), key);
          continue;
        }
        if (exdates.has(d.toISOString().slice(0, 16))) continue;
        const start = new Date(d);
        const end = new Date(start.getTime() + dur);
        if (start < to && end > from) push(ev, start, end, key);
      }
    } else {
      const end = ev.end ?? new Date(ev.start.getTime() + dur);
      if (ev.start < to && end > from) push(ev, ev.start, end, key);
    }
  }
  return out;
}
