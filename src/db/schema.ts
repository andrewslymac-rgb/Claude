import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
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
    note: text("note"),
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
  "tasks", // Milestone 2
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
