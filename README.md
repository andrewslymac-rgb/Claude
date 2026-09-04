# Vending Books

A self-hosted bookkeeping app for a small vending machine operation, built to
sync cleanly into QuickBooks Online. Log collections, restocks, commission
payments, and maintenance costs per machine; see profit by machine; push it
all into QuickBooks with no duplicates.

Stack: Python, FastAPI, SQLite, server-rendered HTML (no build step, no
Node required). Runs on your own machine, or hosted on a small server (see
"Deploying to Railway" below) so it's a normal website you can open from
anywhere.

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit .env: at minimum set SECRET_KEY (see comment in the file for how
# to generate one). Leave QBO_CLIENT_ID/SECRET blank until you've done the
# QuickBooks setup below -- everything except syncing works without them.

uvicorn app.main:app --reload
```

Open http://localhost:8000. The SQLite database is created automatically at
`data/vending.db` on first run.

## Deploying to Railway

This turns the app into a normal website with its own URL, so you (or
Brittany, or anyone else you give the link to) can open it from a phone or
laptop without installing anything. Railway hosts it for you; this repo is
already set up for it (`Procfile` and `railway.json`).

Cost is usually a few dollars a month depending on usage (Railway bills by
actual CPU/RAM time, not a flat fee) -- you'll add a card on their site.

**1. Create a Railway account and connect this repo**

1. Go to **railway.app** and sign up -- choose **"Login with GitHub"** and
   authorize it with your GitHub account (the same one this code lives in).
2. Click **New Project > Deploy from GitHub repo**.
3. Pick the repo (search for **"Claude"**, owner `andrewslymac-rgb`). If it
   doesn't show up, click **Configure GitHub App** and grant Railway access
   to that repository.
4. Railway will start building it automatically. While that runs, click
   into the new service, go to the **Settings** tab, find **Source >
   Branch**, and set it to `claude/qbo-vending-app-scope-cxjhvz` (that's
   where this code lives until it's merged into your main branch).

**2. Give it a place to keep its data**

The app's data (your machines, collections, everything) lives in a small
database file. Without this step, that data would get wiped every time the
app updates -- this step makes it permanent:

1. In your Railway project, click **New > Volume**.
2. Set the **mount path** to `/data`.
3. Attach it to this service.

**3. Set the environment variables**

In the service, go to the **Variables** tab and add these one at a time
(click **New Variable** for each):

| Variable | Value |
|---|---|
| `SECRET_KEY` | Any long random string -- e.g. mash your keyboard for 40+ characters, or ask me to generate one for you |
| `DATABASE_URL` | `sqlite:////data/vending.db` (note: four slashes) |
| `APP_BASE_URL` | Leave as `http://localhost:8000` for now -- you'll change this in step 4 |
| `QBO_ENVIRONMENT` | `sandbox` for now -- switch to `production` once you've tested and are ready to connect your real QuickBooks |

Leave `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET` out for now -- you'll add
those once you've done the QuickBooks Developer Setup below. The app runs
fine without them; you just won't be able to connect QuickBooks yet.

Saving a variable triggers a redeploy automatically.

**4. Get your public URL and finish wiring it up**

1. Go to **Settings > Networking** and click **Generate Domain**. Railway
   gives you a URL like `https://vending-books-production.up.railway.app`.
2. Copy that URL, go back to **Variables**, and change `APP_BASE_URL` to it
   (no trailing slash).
3. Open the URL in your browser -- you should see the Vending Books
   dashboard. That's it, it's live.

From here, follow "QuickBooks Developer Setup" below as written, except
wherever it says `http://localhost:8000`, use your Railway URL instead
(both for the Redirect URI you register with Intuit, and it'll already be
set as `APP_BASE_URL`). Add `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET` as Railway
variables the same way as step 3 above once you have them.

Any time I push a code update to this branch, Railway redeploys
automatically -- nothing you need to do.

## What it does

- **Machines**: one record per vending machine -- location, location owner/
  contact, commission rate.
- **Collections**: log cash and cashless sales pulled from a machine on a
  given date. (Cashless total is whatever your card reader / processor
  dashboard shows for that period -- there's no live processor integration
  yet, see "Data sources" below.)
- **Restocks**: your cost for the product used to refill a machine.
- **Commissions**: payments to location owners. The form can suggest an
  amount from a machine's commission rate and its collections over a date
  range you pick -- it never auto-creates a payment, you always confirm it.
- **Maintenance**: repair/upkeep costs per machine.
- **Dashboard**: revenue, expenses, and net profit per machine, month to
  date.
- **QuickBooks sync**: pushes all of the above into QuickBooks Online as
  Sales Receipts and Purchases (see mapping below), with duplicate
  prevention and per-record retry on failure.

### Data sources (today vs. later)

This version is built for **manual entry** -- you type in what you collected
after each route stop, same as you'd write it on paper or in a spreadsheet
today. It does not pull DEX telemetry or a cashless processor's API (Nayax,
Cantaloupe, etc.) automatically. If/when you want that, the natural next
step is a small importer that creates `CollectionEntry` rows from a
processor's export or API instead of the manual form -- the rest of the app
(profit reporting, QuickBooks sync) would work unchanged, since it all reads
from the same `CollectionEntry` table regardless of how the row got there.

## QuickBooks Developer Setup

You need a free Intuit Developer account and an app registered on it --
separate from your regular QuickBooks Online login.

1. Go to https://developer.intuit.com and sign in (or create an account) --
   you can use the same email as your QuickBooks Online login, but this is
   a different portal.
2. **Dashboard > Create an app > QuickBooks Online and Payments.**
3. Give it a name (e.g. "Vending Books") and select the **Accounting**
   scope.
4. Once created, go to your app's **Keys & OAuth** section (under
   "Development Settings" while you're testing against the sandbox; a
   separate **Production** tab appears once you request production keys).
   Copy the **Client ID** and **Client Secret** in as `QBO_CLIENT_ID` /
   `QBO_CLIENT_SECRET` -- into your `.env` file if running locally, or as
   Railway Variables if you deployed there (see "Deploying to Railway"
   above).
5. Still on **Keys & OAuth**, add a **Redirect URI**: it must be
   `<APP_BASE_URL>/qbo/callback`, using whatever `APP_BASE_URL` is set to
   -- `http://localhost:8000/qbo/callback` if running locally, or your
   Railway URL (e.g. `https://vending-books-production.up.railway.app/qbo/callback`)
   if hosted there. The two have to match exactly or QuickBooks will
   reject the connection.
6. Leave `QBO_ENVIRONMENT=sandbox` for now. Intuit gives every developer
   app a free **Sandbox Company** (a fake QuickBooks company with test
   data) under the **Sandbox** tab -- use that to try the whole flow
   before connecting your real books.
7. Restart the app (or, on Railway, just save the variables -- it
   redeploys itself), go to **Settings** in Vending Books, and click
   **Connect to QuickBooks**. Log in with your Intuit developer sandbox
   credentials and authorize the app against your sandbox company.
8. Once you're happy with how things map (see below), request **Production**
   keys for your app in the developer portal (Intuit reviews basic app
   info -- for a single-company internal tool like this it's typically
   approved quickly), set `QBO_ENVIRONMENT=production` in `.env`, swap in
   the production Client ID/Secret, restart, and reconnect -- this time
   authorizing against your real QuickBooks Online company.

You do not need to publish the app or go through Intuit's full App Store
review -- that's only required if you intend to distribute the app to other
companies. For your own single company, sandbox-then-production is enough.

## QuickBooks account mapping

**Confirm every field on the Settings page before syncing real data.**
These are the assumptions this app makes about how your transactions should
land in QuickBooks -- they're deliberately explicit and editable rather than
hardcoded, because "how vending income should be booked" varies a lot by
business and by what your accountant wants.

| App field | What it's for | Typical choice |
|---|---|---|
| Per-machine tracking | Which QuickBooks feature tags each transaction to a machine | **Class**, unless you already use Locations for something else in QuickBooks |
| Deposit sales to | Where a Sales Receipt's money lands | **Undeposited Funds**, if you batch cash into the bank later; your checking account if it's same-day |
| Vending sales item | The Product/Service item used on every Sales Receipt line -- its income account is where revenue actually posts | Create one item in QuickBooks first: *Sales > Products and Services > New > Service*, name it "Vending Sales", income account = your vending revenue account |
| Restock cost account | Expense/COGS account for product cost | A **Cost of Goods Sold** account, e.g. "Cost of Goods Sold" or a dedicated "Vending Product Cost" |
| Commission expense account | Expense account for location-owner payouts | An **Expense** account, e.g. "Commissions" |
| Maintenance expense account | Expense account for repairs | An **Expense** account, e.g. "Repairs & Maintenance" |
| Paid from | The bank/credit-card account restock, commission, and maintenance purchases are recorded as paid from | Whatever account you actually spend from |

Two things happen automatically the first time a machine has something to
sync, so you don't have to set them up by hand in QuickBooks first:

- A QuickBooks **Class** (or **Department**, if you chose Location tracking)
  is created per machine, named after the machine, so QuickBooks reports
  (P&L by Class/Location) break out per machine.
- A QuickBooks **Vendor** is created for a machine's location owner/contact
  the first time a commission payment for that machine is synced, so
  QuickBooks can track and 1099 them if needed.

Every synced transaction gets a `DocNumber` like `VC-<id>` (collection),
`VR-<id>` (restock), `VP-<id>` (commission), or `VM-<id>` (maintenance) so
you can trace it back to this app from inside QuickBooks.

### Why Sales Receipts and Purchases, not Invoices or Bills

Collections are money you've already collected, not money owed to you, so
they're booked as **Sales Receipts** (paid in full at the time of the
transaction), not Invoices. Restock, commission, and maintenance costs are
recorded as **Purchases** (an expense already paid), not **Bills** (money
you owe later) -- because by the time you're logging them, you've already
spent the money. If your business runs differently (e.g. you actually pay
location owners on a billing cycle, on account), say so and this can be
changed to Bills instead.

## Duplicate prevention & sync failures

Every record that's ever been synced (or attempted) has a row in an internal
sync-tracking table keyed to that record. Before creating anything in
QuickBooks, the sync service checks that table first:

- Never synced -> creates a new QuickBooks object.
- Already synced -> fetches the current object from QuickBooks (to get its
  latest `SyncToken`, which QuickBooks requires for any update) and updates
  it in place, rather than creating a duplicate. This also means editing a
  QuickBooks account it already has changed directly in QuickBooks doesn't
  get silently clobbered by a stale copy.
- A record is only ever marked "synced" after QuickBooks confirms the
  write -- if the app crashes mid-sync, or QuickBooks is down, the record
  just stays "pending" or "failed" for the next sync run to pick up. It can
  never end up double-posted.

The **QuickBooks Sync** page shows every record's status (pending / synced /
failed), the error message for anything that failed, and lets you retry one
record or everything at once. A validation error (e.g. missing account
mapping) is shown before anything is sent, and a QuickBooks API error (bad
token, invalid account reference, etc.) is caught and shown per-record
rather than crashing the batch.

## Running tests

```bash
source .venv/bin/activate
python -m pytest
```

Tests cover:

- **Financial calculations** (`tests/test_calculations.py`) -- revenue,
  expense, and profit-per-machine math, including edge cases like entries
  outside the reporting period, other machines' entries being excluded, and
  negative profit.
- **QuickBooks payload mapping** (`tests/test_qbo_mapping.py`) -- that a
  collection/restock/commission/maintenance record turns into the exact
  QuickBooks JSON expected (right accounts, right Class/Vendor references,
  right amounts), with no network calls.
- **Sync service** (`tests/test_sync.py`) -- duplicate prevention (a record
  synced twice creates exactly one QuickBooks object and updates on the
  second run), failure handling (a QuickBooks error is captured on the
  record and doesn't stop the rest of a batch sync), and retry behavior --
  all against an in-memory fake QuickBooks client, no network calls.
- **OAuth token exchange** (`tests/test_qbo_oauth.py`) -- authorize-URL
  construction and the token exchange/refresh request shape, mocked at the
  HTTP layer.

## Project layout

```
app/
  main.py            FastAPI app setup
  models.py           SQLAlchemy models (machines, entries, QBO connection/settings, sync records)
  calculations.py      Revenue/expense/profit math
  forms.py             Shared form-parsing/validation helpers
  qbo/
    oauth.py            OAuth 2.0 authorize/token-exchange/refresh
    client.py           QuickBooks API client (auto-refreshing)
    mapping.py          Local record -> QuickBooks JSON payloads
    sync.py             Sync orchestration, idempotency, retry
  routes/               FastAPI routers (dashboard, machines, entries, qbo_auth, settings, sync)
  templates/            Jinja2 templates
  static/style.css
tests/
```
