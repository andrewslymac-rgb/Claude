import type { FieldTool } from "@/db/schema";

/** Field-service software a company can run on. Drives the live tile, the launcher and the daily feed. */
export const FIELD_TOOL_INFO: Record<FieldTool, { label: string; emoji: string; color: string; home: string; links: { schedule: string; requests: string; quotes: string; invoices: string }; words: { requests: string; quotes: string; visits: string } }> = {
  jobber: {
    label: "Jobber",
    emoji: "🗓️",
    color: "#7db00e",
    home: "https://secure.getjobber.com/",
    links: { schedule: "https://secure.getjobber.com/calendar", requests: "https://secure.getjobber.com/requests", quotes: "https://secure.getjobber.com/quotes", invoices: "https://secure.getjobber.com/invoices" },
    words: { requests: "New requests", quotes: "Quotes waiting", visits: "Jobs today" },
  },
  gorilladesk: {
    label: "GorillaDesk",
    emoji: "🦍",
    color: "#2f6fed",
    home: "https://app.gorilladesk.com/",
    links: { schedule: "https://app.gorilladesk.com/", requests: "https://app.gorilladesk.com/", quotes: "https://app.gorilladesk.com/", invoices: "https://app.gorilladesk.com/" },
    words: { requests: "New leads", quotes: "Estimates pending", visits: "Jobs today" },
  },
  none: { label: "Field service", emoji: "🧰", color: "#6366f1", home: "#", links: { schedule: "#", requests: "#", quotes: "#", invoices: "#" }, words: { requests: "New requests", quotes: "Quotes waiting", visits: "Jobs today" } },
};
