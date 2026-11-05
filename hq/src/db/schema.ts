import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  date,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// People & access
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  /** App admins can create workspaces and see every workspace. */
  isAppAdmin: boolean("is_app_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the cookie token. The raw token is never stored. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  icon: text("icon").notNull().default("🏢"),
  /** Accent color (hex) used in the sidebar and dashboard header. */
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Roles, from most to least access:
 *  owner  – everything, including deleting the workspace and managing owners
 *  admin  – manage members, dashboard, connectors and AI tokens
 *  editor – create and edit pages and tasks
 *  viewer – read only (can still tick off tasks assigned to them, M2)
 */
export const roleEnum = pgEnum("role", ["owner", "admin", "editor", "viewer"]);

export const memberships = pgTable(
  "memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("editor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

/** Someone added by email who hasn't signed in yet. Turned into a membership on first sign-in. */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull().default("editor"),
    invitedById: uuid("invited_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invites_ws_email_idx").on(t.workspaceId, t.email)],
);

// ---------------------------------------------------------------------------
// Pages (the "company brain")
// ---------------------------------------------------------------------------

export const pageSourceEnum = pgEnum("page_source", ["local", "gdrive"]);
export const docStatusEnum = pgEnum("doc_status", ["active", "needs_review", "draft", "outdated", "archived"]);
export const reviewCycleEnum = pgEnum("review_cycle", ["quarterly", "semiannual", "annual"]);

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    title: text("title").notNull().default(""),
    icon: text("icon"),
    /** BlockNote document (array of blocks). */
    content: jsonb("content").$type<unknown[]>().notNull().default([]),
    /** Markdown copy of the content, used for search and for AI tools. */
    contentText: text("content_text").notNull().default(""),
    /** Sort order among siblings. Fractional so we can insert between two pages. */
    position: doublePrecision("position").notNull().default(0),
    /** Marks a page as an SOP / policy so it shows in SOP widgets and AI "policy" search. */
    isSop: boolean("is_sop").notNull().default(false),
    /** Where the content comes from. gdrive pages are read-only here (Milestone 3). */
    source: pageSourceEnum("source").notNull().default("local"),
    driveFileId: text("drive_file_id"),
    driveModifiedAt: timestamp("drive_modified_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    // --- Document info (compliance) --------------------------------------
    docType: text("doc_type"),
    area: text("area"),
    audience: jsonb("audience").$type<string[]>().notNull().default([]),
    docStatus: docStatusEnum("doc_status"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    reviewCycle: reviewCycleEnum("review_cycle"),
    lastReviewedOn: date("last_reviewed_on"),
    lastReviewedById: uuid("last_reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Where the original lives if it isn't this page (Drive link, Orchard, etc.). */
    sourceLink: text("source_link"),
    sensitive: boolean("sensitive").notNull().default(false),
    docVersion: text("doc_version"),
    // ---------------------------------------------------------------------
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when moved to Trash. Nothing is hard-deleted from the UI. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("pages_ws_parent_idx").on(t.workspaceId, t.parentId),
    uniqueIndex("pages_drive_file_idx").on(t.workspaceId, t.driveFileId),
  ],
);

/** Who made a change. "ai" and "sync" arrive in Milestones 3–4 but are modeled now. */
export const actorTypeEnum = pgEnum("actor_type", ["user", "ai", "sync"]);

/**
 * Every saved state of a page. Rapid edits by the same person are folded into one
 * version (see services/pages.ts), so history reads like Google Docs, not keystrokes.
 */
export const pageVersions = pgTable(
  "page_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    content: jsonb("content").$type<unknown[]>().notNull(),
    contentText: text("content_text").notNull(),
    actorType: actorTypeEnum("actor_type").notNull().default("user"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** API token id for AI edits (Milestone 4). */
    actorTokenId: uuid("actor_token_id"),
    /** What changed (shown in history and the change log). */
    note: text("note"),
    /** Why it changed. */
    why: text("why"),
    /** Ticked once the team has been told about this change. */
    teamTold: boolean("team_told").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("page_versions_page_idx").on(t.pageId, t.version)],
);

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const widgetTypeEnum = pgEnum("widget_type", [
  "welcome", // greeting + announcement text
  "links", // quick links to tools (Jobber, QuickBooks, Gusto…)
  "pages", // hand-picked pages
  "sops", // every page marked as SOP
  "recent", // recently updated pages
  "tasks", // overdue / today / this week
  "reviews", // documents needing review
]);

export type LinkItem = { label: string; url: string; emoji?: string };
export type WidgetConfig = {
  text?: string; // welcome
  links?: LinkItem[]; // links
  pageIds?: string[]; // pages
  limit?: number; // recent / sops
};

export const dashboardWidgets = pgTable(
  "dashboard_widgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: widgetTypeEnum("type").notNull(),
    title: text("title").notNull(),
    config: jsonb("config").$type<WidgetConfig>().notNull().default({}),
    /** 1 = normal tile, 2 = wide tile. */
    width: integer("width").notNull().default(1),
    position: doublePrecision("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("widgets_ws_idx").on(t.workspaceId)],
);

export type Role = (typeof roleEnum.enumValues)[number];
export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type PageVersion = typeof pageVersions.$inferSelect;
export type DashboardWidget = typeof dashboardWidgets.$inferSelect;
export type WidgetType = (typeof widgetTypeEnum.enumValues)[number];

// ---------------------------------------------------------------------------
// Document compliance (Milestone 2): extra fields on pages, change-log fields
// on versions, and flags. These mirror the Notion Document Library.
// ---------------------------------------------------------------------------


export const DOC_TYPES = ["Policy", "SOP", "Checklist", "Form", "Script", "Scope of Service", "Rate Card", "Training", "Reference", "Meeting"] as const;
export const DOC_AREAS = ["Onboarding & HR", "Pay & Time", "Safety & Compliance", "Cleaning Standards", "Sales & Follow-Up", "Scopes & Rates", "Training", "Office Admin", "Supplies & Equipment", "Company & Meetings", "Field Operations"] as const;
export const DOC_AUDIENCES = ["Field Team", "Trainers & Leads", "Office Manager", "Owners"] as const;

export const flagTypeEnum = pgEnum("flag_type", ["contradiction", "duplicate", "missing_document", "outdated", "incomplete", "open_decision", "compliance_risk", "naming_mismatch"]);
export const flagSeverityEnum = pgEnum("flag_severity", ["high", "medium", "low"]);
export const flagStatusEnum = pgEnum("flag_status", ["open", "in_progress", "resolved", "wont_fix"]);

export const flags = pgTable(
  "flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: flagTypeEnum("type").notNull().default("open_decision"),
    severity: flagSeverityEnum("severity").notNull().default("medium"),
    status: flagStatusEnum("status").notNull().default("open"),
    whoDecides: text("who_decides"),
    whatWeFound: text("what_we_found").notNull().default(""),
    nextStep: text("next_step").notNull().default(""),
    pageId: uuid("page_id").references(() => pages.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    foundAt: timestamp("found_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("flags_ws_idx").on(t.workspaceId, t.status)],
);

// ---------------------------------------------------------------------------
// Tasks (Milestone 2): recurring operations tasks with completion history.
// ---------------------------------------------------------------------------

export const frequencyEnum = pgEnum("frequency", ["once", "daily", "weekly", "monthly", "quarterly", "annual"]);

export const TASK_CATEGORIES = ["Finance", "Payroll", "Tax", "HR", "Compliance", "Insurance", "Marketing", "Operations", "Safety", "Quality", "Customer Service", "Sales"] as const;

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category"),
    frequency: frequencyEnum("frequency").notNull().default("once"),
    /** Free text like "First Monday of the month" or "By the 15th". */
    whenText: text("when_text"),
    instructions: text("instructions").notNull().default(""),
    /** A role that owns the task when no specific person does, e.g. "Office Manager". */
    ownerRole: text("owner_role"),
    /** Optional link to the SOP that explains how to do it. */
    sopPageId: uuid("sop_page_id").references(() => pages.id, { onDelete: "set null" }),
    /** One-off tasks: the due date. Recurring tasks: the first due date (optional). */
    dueOn: date("due_on"),
    /** Denormalized from the latest completion. */
    lastDoneOn: date("last_done_on"),
    nextDueOn: date("next_due_on"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_ws_idx").on(t.workspaceId, t.frequency), index("tasks_due_idx").on(t.workspaceId, t.nextDueOn)],
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

/** One row per time a task is marked done. Undo deletes the latest row. */
export const taskCompletions = pgTable(
  "task_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    doneOn: date("done_on").notNull(),
    doneById: uuid("done_by_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_completions_task_idx").on(t.taskId, t.doneOn)],
);

export type Task = typeof tasks.$inferSelect;
export type Frequency = (typeof frequencyEnum.enumValues)[number];
export type DocStatus = (typeof docStatusEnum.enumValues)[number];
export type ReviewCycle = (typeof reviewCycleEnum.enumValues)[number];
export type Flag = typeof flags.$inferSelect;
