/**
 * Creates the owner account and one workspace per company, each with a starter
 * dashboard and a few pages. Safe to run more than once: anything that already
 * exists is left alone.
 */
import { loadEnv } from "./load-env";
loadEnv();

import { eq } from "drizzle-orm";
import type { LinkItem } from "./schema";

type Starter = { name: string; slug: string; icon: string; color: string; links: LinkItem[] };

const COMMON_LINKS: LinkItem[] = [
  { label: "Gmail", url: "https://mail.google.com", emoji: "✉️" },
  { label: "Google Drive", url: "https://drive.google.com", emoji: "📁" },
  { label: "Calendar", url: "https://calendar.google.com", emoji: "📅" },
  { label: "QuickBooks", url: "https://qbo.intuit.com", emoji: "💵" },
  { label: "Gusto", url: "https://app.gusto.com", emoji: "🧾" },
];

const STARTERS: Starter[] = [
  {
    name: "Lemon and Lavender Cleaning Co.",
    slug: "lemon-and-lavender",
    icon: "🍋",
    color: "#8b5cf6",
    links: [{ label: "Jobber", url: "https://secure.getjobber.com", emoji: "🧹" }, { label: "Slack", url: "https://slack.com/app_redirect?channel=general", emoji: "💬" }, { label: "Quo (phones)", url: "https://my.quo.com", emoji: "📞" }, ...COMMON_LINKS],
  },
  {
    name: "Adapt Pest Pros",
    slug: "adapt-pest-pros",
    icon: "🐜",
    color: "#16a34a",
    links: [{ label: "GorillaDesk", url: "https://app.gorilladesk.com", emoji: "🦍" }, { label: "Slack", url: "https://slack.com/app_redirect?channel=general", emoji: "💬" }, { label: "Quo (phones)", url: "https://my.quo.com", emoji: "📞" }, ...COMMON_LINKS],
  },
  {
    name: "Clever Vending",
    slug: "clever-vending",
    icon: "🥤",
    color: "#0ea5e9",
    links: [...COMMON_LINKS],
  },
];

const p = (text: string) => ({ type: "paragraph", content: text });
const h = (text: string, level = 2) => ({ type: "heading", props: { level }, content: text });
const li = (text: string) => ({ type: "bulletListItem", content: text });
const todo = (text: string) => ({ type: "checkListItem", content: text });

const START_HERE = {
  title: "Start here",
  icon: "👋",
  content: [
    p("Welcome to Orbit — the home base for everything we do. Here's all you need to know:"),
    h("Finding things"),
    li("The left sidebar lists every page. Click the arrow next to a page to see the pages inside it."),
    li("Press Ctrl + K (⌘ + K on Mac) to search everything."),
    li("Home (top of the sidebar) is the dashboard: links, SOPs and what's new."),
    h("Writing"),
    li("Just click and type. Changes save automatically."),
    li('Type "/" for headings, checklists, images, tables and more.'),
    li("Drag the ⋮⋮ handle on the left of any line to move it."),
    h("Made a mistake?"),
    p('Click "History" at the top right of any page to see and restore earlier versions.'),
  ],
  text: "Welcome to Orbit. Use the sidebar to find pages, Ctrl+K to search, type / for formatting, and History to restore older versions.",
};

const SOP_FOLDER = {
  title: "SOPs & Policies",
  icon: "📚",
  content: [p("Every standard operating procedure and policy lives under this page. Mark a page as an SOP from its ••• menu so it shows on the dashboard.")],
  text: "Every standard operating procedure and policy lives under this page.",
};

const SAMPLE_SOP = {
  title: "Sample SOP: Opening checklist",
  icon: "✅",
  content: [
    h("Purpose", 2),
    p("Replace this with a real SOP. This is an example of the format."),
    h("Steps", 2),
    todo("Check today's schedule"),
    todo("Load the vehicle with supplies"),
    todo("Text the first client your ETA"),
  ],
  text: "## Purpose\nReplace this with a real SOP.\n## Steps\n- [ ] Check today's schedule\n- [ ] Load the vehicle with supplies\n- [ ] Text the first client your ETA",
};

async function main() {
  // Imported here (not at the top) so .env is loaded before the database pool is created.
  const { db, schema } = await import("./index");
  const { users, workspaces, memberships, pages, pageVersions, dashboardWidgets } = schema;
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    console.warn("OWNER_EMAIL is not set; skipping starter workspaces.");
    process.exit(0);
  }

  let [owner] = await db.select().from(users).where(eq(users.email, ownerEmail));
  if (!owner) {
    [owner] = await db.insert(users).values({ email: ownerEmail, name: "Andrew", isAppAdmin: true }).returning();
    console.log(`✓ Created owner ${ownerEmail}`);
  } else if (!owner.isAppAdmin) {
    await db.update(users).set({ isAppAdmin: true }).where(eq(users.id, owner.id));
  }

  for (const s of STARTERS) {
    const [existing] = await db.select().from(workspaces).where(eq(workspaces.slug, s.slug));
    if (existing) {
      console.log(`• ${s.name} already exists, skipping`);
      continue;
    }
    const [ws] = await db.insert(workspaces).values({ name: s.name, slug: s.slug, icon: s.icon, color: s.color }).returning();
    await db.insert(memberships).values({ workspaceId: ws.id, userId: owner.id, role: "owner" });

    const mk = async (d: { title: string; icon: string; content: unknown[]; text: string }, position: number, parentId: string | null = null, isSop = false) => {
      const [pg] = await db
        .insert(pages)
        .values({ workspaceId: ws.id, parentId, title: d.title, icon: d.icon, content: d.content, contentText: d.text, position, isSop, createdById: owner.id, updatedById: owner.id })
        .returning();
      await db.insert(pageVersions).values({ pageId: pg.id, version: 1, title: pg.title, content: pg.content, contentText: pg.contentText, actorUserId: owner.id, note: "Created" });
      return pg;
    };
    const start = await mk(START_HERE, 1);
    const sops = await mk(SOP_FOLDER, 2);
    await mk(SAMPLE_SOP, 1, sops.id, true);

    await db.insert(dashboardWidgets).values([
      { workspaceId: ws.id, type: "welcome", title: "Welcome", width: 2, position: 1, config: { text: `This is the ${s.name} home base. Pin the links and SOPs your team uses every day.` } },
      { workspaceId: ws.id, type: "links", title: "Tools", width: 1, position: 2, config: { links: s.links } },
      { workspaceId: ws.id, type: "sops", title: "SOPs & Policies", width: 1, position: 3, config: { limit: 8 } },
      { workspaceId: ws.id, type: "pages", title: "Pinned pages", width: 1, position: 4, config: { pageIds: [start.id, sops.id] } },
      { workspaceId: ws.id, type: "recent", title: "Recently updated", width: 1, position: 5, config: { limit: 6 } },
      { workspaceId: ws.id, type: "tasks", title: "My tasks", width: 1, position: 1.5, config: { limit: 8 } },
      { workspaceId: ws.id, type: "reviews", title: "Reviews due", width: 1, position: 3.5, config: { limit: 6 } },
    ]);
    await db.insert(schema.tasks).values([
      { workspaceId: ws.id, title: "Check today's schedule and confirm with the team", category: "Operations", frequency: "daily", nextDueOn: new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }), createdById: owner.id },
      { workspaceId: ws.id, title: "Run payroll", category: "Payroll", frequency: "weekly", whenText: "Every Friday", nextDueOn: new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }), createdById: owner.id },
      { workspaceId: ws.id, title: "Reconcile bank accounts in QuickBooks", category: "Finance", frequency: "monthly", whenText: "By the 5th", nextDueOn: new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }), createdById: owner.id },
      { workspaceId: ws.id, title: "Review insurance coverage", category: "Insurance", frequency: "annual", nextDueOn: new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }), createdById: owner.id },
    ]);
    console.log(`✓ Created workspace ${s.name}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
