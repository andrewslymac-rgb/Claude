# Orbit: company headquarters

One home base for Lemon and Lavender Cleaning Co., Adapt Pest Pros and Clever Vending: Notion-style pages, a customizable dashboard, SOPs, people and permissions. Coming next: recurring tasks, Google Drive SOP sync, and an AI/MCP connection for Claude.

The full architecture, build order and Drive/AI design are in **[docs/PLAN.md](docs/PLAN.md)**.

## What works today (Milestone 1)

- **Workspaces**: one per company, switch from the top-left menu. Each has its own pages, dashboard, people and color.
- **Pages**: click and type. Type `/` for headings, checklists, tables and more. Drag `⋮⋮` to move blocks. Changes save automatically.
- **Page tree**: nest pages inside pages. Drag pages in the sidebar to reorder them, or drop one onto another to put it inside.
- **History**: every page keeps its past versions. Click **History** to preview any version and restore it (restoring never deletes anything).
- **Trash**: deleted pages go to Trash and can be restored.
- **Search**: press **Ctrl + K** (⌘ + K on Mac).
- **SOPs**: mark any page as an SOP (••• menu). SOPs show up in the dashboard's SOP tile.
- **Dashboard**: click **Customize** to add, remove, resize or drag tiles: quick links to your tools, SOP list, pinned pages, recently updated, and an announcement.
- **People**: Settings → add people by email as Owner, Admin, Editor or Viewer, separately for each company.

---

## Run it on your computer (about 10 minutes)

You need two free programs installed once:

1. **Node.js 20 or newer**: download the "LTS" version from https://nodejs.org and install it.
2. **PostgreSQL** (the database). Easiest options:
   - Mac: install **Postgres.app** from https://postgresapp.com and click "Initialize".
   - Windows: install from https://www.postgresql.org/download/windows/ and remember the password you choose.

Then open Terminal (Mac) or PowerShell (Windows), go to this folder and run:

```bash
cd hq
npm install
cp .env.example .env
```

Open the new `.env` file in any text editor and check `DATABASE_URL`. The default is
`postgres://postgres:postgres@localhost:5432/hq`. Change the second `postgres` to your password if you set one. Create the database, then set it up:

```bash
createdb hq          # or create a database called "hq" in your Postgres app
npm run setup        # creates tables + your 3 workspaces with starter pages
npm run dev
```

Open http://localhost:3000. Until Google sign-in is set up, you'll see a **dev login** box: type the email from `OWNER_EMAIL` and you're in.

To test what a team member sees: in Settings, add another email as a Viewer or Editor, sign out, and sign in with that email using dev login.

## Put it online (Railway)

1. In Railway, create a **New Project → Deploy from GitHub repo**, and pick this repo.
2. In the service **Settings → Root Directory**, enter `hq`.
3. Click **+ New → Database → PostgreSQL** in the same project.
4. In your app service, go to **Variables** and add:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Railway offers this as a reference)
   - `APP_URL` = your app's address, e.g. `https://orbithq.co` (see step 5)
   - `OWNER_EMAIL` = your email
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (next section)
5. **Settings → Networking → Generate Domain** (or add your own domain).
6. Deploy. On every deploy the app updates the database tables and makes sure your 3 starter workspaces exist (it never overwrites anything you've changed).

Dev login is automatically off in production.

## Set up Google sign-in (about 5 minutes)

1. Go to https://console.cloud.google.com, create a project called "Orbit".
2. **APIs & Services → OAuth consent screen**: choose **Internal** if you use Google Workspace (only your company accounts can sign in, no Google review needed), otherwise **External**. Add the app name and your email.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application**.
   - Authorized redirect URI: `https://YOUR-APP-ADDRESS/api/auth/google/callback`
     (and `http://localhost:3000/api/auth/google/callback` for testing on your computer)
4. Copy the **Client ID** and **Client secret** into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Only people you've added in Settings (or at a domain listed in `ALLOWED_EMAIL_DOMAINS`) can sign in.

---

## For developers

- `src/db/schema.ts`: all tables. After changing it, run `npm run db:generate` to create a migration in `drizzle/`, then `npm run db:migrate`.
- `src/lib/services/*`: **all writes go through here** with an `Actor` (user / ai / sync). Permission checks happen in `src/app/actions.ts` (UI) and will happen in the API routes (Milestone 4). Never write to `pages` without going through `services/pages.ts`, or version history breaks.
- `src/lib/access.ts` and `src/lib/permissions.ts`: workspace roles.
- `src/components/page/Editor.tsx`: BlockNote editor. Content is stored as BlockNote JSON plus a Markdown copy (`content_text`) for search and AI.
- `npm run typecheck`, `npm run build`.
