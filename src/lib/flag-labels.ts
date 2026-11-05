export type FlagType = "contradiction" | "duplicate" | "missing_document" | "outdated" | "incomplete" | "open_decision" | "compliance_risk" | "naming_mismatch";
export type FlagSeverity = "high" | "medium" | "low";
export type FlagStatus = "open" | "in_progress" | "resolved" | "wont_fix";

export const FLAG_TYPE_LABELS: Record<FlagType, string> = {
  contradiction: "Contradiction",
  duplicate: "Duplicate",
  missing_document: "Missing document",
  outdated: "Outdated",
  incomplete: "Incomplete",
  open_decision: "Open decision",
  compliance_risk: "Compliance risk",
  naming_mismatch: "Naming mismatch",
};
export const FLAG_STATUS_LABELS: Record<FlagStatus, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved", wont_fix: "Won't fix" };
