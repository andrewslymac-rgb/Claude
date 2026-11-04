# Orbit: architecture and build plan

Orbit is the company operating system for Lemon and Lavender Cleaning Co., Adapt Pest Pros, Clever Vending and future ventures. It is a Notion-style workspace with a customizable dashboard, Google Drive SOP sync, recurring tasks, and an AI-facing API and MCP server.

**Rule for every design decision:** if a non-technical team member couldn't use it without training, it's wrong. Simple defaults first; customization second.

---

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| App framework | **Next.js 16 (React 19, TypeScript)** | One codebase for the UI, the server logic, the public API and the MCP endpoint. It's the most widely used React framework, so hiring help later is easy. |
| Editor | **BlockNote** (built on ProseMirror/TipTap) | Gives the Notion feel out of the box: a "/" menu, drag handles, checklists, tables, images. Open source (MPL-2.0). Building our own editor would take months. |
| Database | **PostgreSQL** + **Drizzle ORM** | Postgres can do relational data, JSON documents and full-text search in one place. Drizzle is lightweight, typed, and runs plain SQL migrations. |
| Sign-in | **Google sign-in** (via the `arctic` library), our own sessions | Everyone already has Google accounts. No passwords to manage. Sessions are stored in the database so you can sign anyone out instantly. |
| Styling | Tailwind CSS 4 + lucide icons | Clean, consistent look; fast to build with. |
| Hosting | **Railway** (app + Postgres + cron) | You already use Railway for Vending Books. Unlike Vercel, it runs one always-on server, which suits Drive webhooks, background sync and the MCP server. Roughly $5–20/month at your size. |
| File storage (later) | Cloudflare R2 or Railway volume | For images pasted into pages. Deferred; Milestone 1 doesn't support uploads. |
| AI access | REST API + **MCP server** (`@modelcontextprotocol/sdk`, Streamable HTTP) at `/api/mcp` | Claude (claude.ai, Claude Code, Cowork) and other tools connect directly. |

### How it fits together

```
 Browser (team)        Claude / AI tools            Google Drive
      │                       │                          │
      │ pages, dashboard      │ MCP + REST (bearer token) │ push notifications + polling
      ▼                       ▼                          ▼
 ┌──────────────────────── Next.js app on Railway ─────────────────────────┐
 │  UI (React)   Server actions   /api/v1/*   /api/mcp   /api/drive/webhook  │
 │                     │              │           │              │          │
 │                     └──────────────┴───── Service layer ──────┘          │
 │                 (permissions check + version history on EVERY write)      │
 └──────────────────────────────────┬───────────────────────────────────────┘
                                    ▼
                               PostgreSQL
```

Key idea: **everything writes through one service layer** (`src/lib/services`). The UI, the API, the MCP server and the Drive sync all call the same functions, each with an "actor" (a person, an AI token, or the Drive sync). That means permissions and version history work the same way no matter who makes the change, and AI edits are always tracked and reversible.

---

## 2. Data model (Milestone 1, already built)

- **users**: anyone who can sign in. `is_app_admin` = can create workspaces and see all of them (you).
- **workspaces**: one per company, each with its own icon, color, dashboard, pages and people.
- **memberships**: user × workspace × role (Owner / Admin / Editor / Viewer).
- **invites**: email + role for people who haven't signed in yet; becomes a membership on first sign-in.
- **pages**: nested tree of pages. Stores the editor document (JSON) **and** a Markdown copy (for search and AI). Flags: `is_sop`, `source` (`local` or `gdrive`), Drive file id.
- **page_versions**: every saved state, with who made it (person / AI / Drive sync). Rapid edits by the same person within 10 minutes fold into one version, so history reads like Google Docs, not keystrokes.
- **dashboard_widgets**: per-workspace tiles (announcement, quick links, SOP list, pinned pages, recently updated, tasks).

### Permissions

| Role | Read | Edit pages/tasks | Customize dashboard | Manage people | Rename/delete workspace |
|---|---|---|---|---|---|
| Viewer | ✓ | | | | |
| Editor | ✓ | ✓ | | | |
| Admin | ✓ | ✓ | ✓ | ✓ (editors/viewers only) | |
| Owner | ✓ | ✓ | ✓ | ✓ | ✓ |

Roles are **per workspace**: a cleaner can be an Editor in Lemon and Lavender and have no access to Adapt Pest Pros at all. Page-level restrictions (private pages, e.g. HR or payroll pages) are planned for Milestone 5.

---

## 3. Google Drive sync: how it works

**Recommendation: one-way sync, Drive → Orbit, for a designated "SOPs" folder per workspace, using push notifications plus a safety-net poll.**

1. **Connect once per workspace.** An Admin picks a Drive folder (ideally in a Shared Drive) in Settings → Connections.
2. **Access.** We use a Google **service account** (a robot Google user). You share the SOP folder with its email, the same way you'd share with a person, as "Viewer". No Google app verification is needed, and access doesn't break when an employee leaves.
3. **Initial import.** Every Google Doc in the folder (and subfolders) is exported as HTML, converted to editor blocks, and saved as a page under "SOPs & Policies", marked as an SOP with a "Drive" badge. Subfolders become parent pages.
4. **Staying current, part 1 (instant): push notifications.** We register a Drive `changes.watch` channel. When anything in the folder changes, Google pings `/api/drive/webhook` within seconds, and Orbit fetches just the changed files. Channels expire after about a week, so a daily job renews them.
5. **Staying current, part 2 (safety net): polling.** Every 10 minutes a background job asks Drive "what changed since last time?" (`changes.list` with a saved page token). This catches anything a missed webhook dropped. It's cheap: one API call when nothing changed.
6. **Each update is a new version** in page history, labeled "Google Drive sync", so you can see exactly what changed and when.
7. **Deletes/moves:** a Doc removed from the folder moves its Orbit page to Trash (recoverable), never hard-deleted.

**Why one-way and not two-way:** Google Docs and block editors format things differently. Converting back and forth on every edit causes subtle formatting damage and "who wins" conflicts when two people edit at once. With one-way sync there is exactly one place to edit an SOP (the Google Doc), and Orbit always shows the latest. Drive-synced pages are read-only in Orbit with an "Edit in Google Docs" button. Pages created in Orbit itself stay fully editable in Orbit.

Option for later: a "Publish to Drive" button that exports an Orbit page as a new Google Doc (one-time copy), if you want to move content the other way.

---

## 4. AI access: API + MCP server, and how AI edits stay safe

### What AI tools can do (Milestone 4)

MCP tools (same capabilities over REST at `/api/v1`):

- `search` (pages and SOPs by keyword; semantic search later)
- `get_page` (returns Markdown)
- `list_pages` / `list_sops`
- `create_page`, `update_page` (Markdown in, converted to blocks), `append_to_page`
- `list_tasks`, `create_task`, `complete_task`
- `get_dashboard`

### Safeguards

1. **Scoped tokens.** An Admin creates a token per AI tool in Settings → AI access. Each token is tied to **one workspace** and has scopes: `read`, `write:pages`, `write:tasks`. Optional: limit it to one section of the page tree (e.g. only under "SOPs & Policies"). Tokens are shown once, stored hashed, can be revoked instantly, and can have an expiry date.
2. **Every AI change is a version.** AI edits never fold into human edits. Each one is its own history entry labeled with the token name ("Claude – Andrew's laptop"), with an optional "reason" the AI must supply.
3. **One-click undo.** An "AI activity" feed (per workspace) lists every AI change with a diff and a Revert button. Reverting is itself a new version, so nothing is lost.
4. **Approval mode (default ON for SOPs).** For pages marked as SOP, AI edits can be set to "suggest" instead of "apply": the change waits in a review queue until an Admin approves it. Regular pages can be "apply directly".
5. **No destructive operations.** AI can't delete pages (only move to Trash, if the token has the scope), can't change permissions, can't touch Drive-synced pages, and can't create tokens.
6. **Limits.** Rate limits per token (e.g. 60 writes/hour) and a maximum page size per write, to stop a runaway agent.
7. **Audit log.** Every API call (read and write) is logged with token, tool, page and time.

**Connecting Claude:** for Claude Code and Cowork, the MCP URL plus the token as a header works directly. claude.ai custom connectors need OAuth, so Milestone 4 includes a small OAuth flow where you click "Allow" in Orbit and pick the workspace and scopes. That flow produces the same scoped tokens behind the scenes.

---

## 5. Build order

| # | Milestone | What you get | Status |
|---|---|---|---|
| **1** | **Foundation** | Google sign-in, 3 workspaces with switcher, Notion-style page editor (nesting, drag to reorder, autosave, icons), version history with restore, Trash, search (Ctrl+K), customizable dashboard (links, SOPs, pinned, recent, announcement; drag to rearrange), people & roles per workspace, invites | **✅ Built** |
| 2 | Tasks | Tasks with assignee, due date, and recurring cadence (daily / weekly / monthly / quarterly / annual, e.g. "every first Monday"). "My tasks" view, Today/This week widget on the dashboard, checklist-style completion, overdue highlighting. Optional link from a task to an SOP. | Next (≈1–2 weeks) |
| 3 | Google Drive SOP sync | Section 3 above. | ≈1–2 weeks |
| 4 | AI API + MCP server | Section 4 above, including the AI activity feed and approval queue. | ≈2 weeks |
| 5 | Polish & depth | Private pages / page-level permissions, image & file uploads, page templates (SOP template, meeting notes), dark mode, mobile layout, email notifications for assigned tasks, full-text search ranking, connector widgets (QuickBooks numbers, Jobber/GorillaDesk jobs today). | After 4 |

### Deferred on purpose (not in the MVP)

- **Real-time co-editing** (two people typing in the same page at once, Google Docs style). Milestone 1 saves every ~0.7 s, and the last save wins. Fine for a small team; adding live collaboration (Yjs) later fits this design.
- **Databases/tables like Notion's** (custom properties, board/calendar views). Tasks cover the main need.
- **Two-way Drive sync** (see above).
- **Comments and @mentions.**
- **Native mobile apps.** The web app will be made mobile-friendly in Milestone 5.
- **Billing/multi-company SaaS.** Built multi-tenant-ready, but there's no sign-up/billing for outside customers.

---

## 6. Assumptions (change any of these)

1. **Hosting on Railway**, same as Vending Books.
2. **Sign-in is Google only**, and only people you've invited (or anyone at an allowed domain, if you set `ALLOWED_EMAIL_DOMAINS`) can get in.
3. **You (OWNER_EMAIL) are app admin**: you see every workspace and can create new ones. Everyone else sees only workspaces they've been added to.
4. **Drive is the source of truth for SOPs** that live in Drive; one-way sync.
5. **Starter dashboard links** (Jobber for Lemon and Lavender, GorillaDesk for Adapt Pest Pros, plus Gmail, Drive, Calendar, QuickBooks, Gusto, Quo) are guesses from the tools you use. Edit them in Customize.
6. **Times and "Good morning" use Pacific time.**
7. Light mode only for now.
