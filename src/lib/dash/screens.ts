import type { FieldTool } from "@/db/schema";

/**
 * Every dashboard screen Orbit knows about. A company only sees the ones built for
 * the field software it runs on, so Lemon and Lavender (Jobber) and Adapt (GorillaDesk)
 * each get their own set and never each other's.
 */
export type ScreenDef = { id: string; label: string; help: string; icon: "receipt"; fieldTool: FieldTool };

export const SCREENS: ScreenDef[] = [
  { id: "ar", label: "AR chaser board", help: "Every unpaid invoice by age, with reminders and follow-up notes", icon: "receipt", fieldTool: "jobber" },
];

export const screensFor = (fieldTool: FieldTool) => SCREENS.filter((s) => s.fieldTool === fieldTool);
