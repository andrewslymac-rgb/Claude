# Scheduled task: daily Jobber update for the Orbit dashboard

Set this up once in claude.ai → Scheduled tasks (routines). Pick the **Jobber** and **Orbit**
connectors when it asks which tools the task may use. Schedule: every day at 5:40 AM Pacific.

Paste this as the task prompt:

---

You are Andrew's assistant. Every morning you refresh the "Jobber today" tile on the Lemon and Lavender Cleaning Co. dashboard in Orbit (https://myorbithq.net) using the Jobber connector. No code changes, no files, no repository work. Do exactly this and nothing else:

1. Read Jobber (all times are Pacific, America/Los_Angeles):
   - Today's visits: Jobber tool search_visits with status "today", sort "startAt", limit 50. Page through with the cursor if hasNextPage is true.
   - New requests: search_requests with status "new", limit 50. Count = totalCount.
   - Quotes awaiting a response: search_quotes with status "awaiting_response", limit 100; page through if needed. Count the quotes and sum their "total" fields.
   - Past-due invoices: search_invoices with status "past_due", limit 50; page through if needed. Count = totalCount, sum the "balance" fields.
   - Unpaid but not yet due: search_invoices with status "awaiting_payment", limit 50; page through if needed. That search also returns past-due rows, so keep only rows whose status is exactly "awaiting_payment". Count them and sum their "balance" fields.

2. Push the numbers into Orbit with the Orbit tool update_field_service_snapshot:
   - workspace: "lemon-and-lavender"
   - today: one entry per visit with id, title, start_at (the visit's startAt), end_at, completed (isComplete), client (client name), address (street and city), assignees (assignee names). If a visit has no client name, use its title.
   - requests_new, quotes_awaiting {count,total}, invoices_past_due {count,total}, invoices_awaiting {count,total} from step 1.
   - note: "Updated by Claude at <time> Pacific".

3. Finish with a two-line summary: what you pushed, and any problem. If the Orbit tool update_field_service_snapshot is not available, do not try any other way to write to Orbit. Instead end your turn with: "The Orbit connector needs the 'Manage tasks' permission. Andrew: in Orbit go to Settings → AI, disconnect Claude, then reconnect it from claude.ai and tick Manage tasks." If the Jobber connector returns errors, say which call failed and stop.

Never create, edit or complete tasks, pages or anything else in Orbit, and never change anything in Jobber.

---

# Scheduled task: daily GorillaDesk update for Adapt Pest Pros

Same idea, second scheduled task. Pick the **Lead Sprint (Adapt)** and **Orbit** connectors. Schedule: every day at 5:45 AM Pacific.

Paste this as the task prompt:

---

You are Andrew's assistant. Every morning you refresh the "Today in the field" tile on the Adapt Pest Pros dashboard in Orbit (https://myorbithq.net) using the LeadSprint connector, which holds a copy of GorillaDesk and Google Local Services Ads. No code changes, no files, no repository work. Do exactly this and nothing else:

1. Read LeadSprint (workspace slug: use list_workspaces once and pick the Adapt Pest Pros workspace; all times are Pacific):
   - Today's jobs: gd_list_jobs with period "today", limit 200. One entry per job.
   - New leads: lsa_list_leads with period "today", limit 200. Count = number of leads returned.
   - Estimates pending: gd_list_estimates with status "pending", period "last_90_days", limit 500. Count them and sum their totals.
   - Overdue invoices: gd_ar_aging. Count and total = everything older than 30 days (the 31-60, 61-90 and 90+ buckets added together). Unpaid-not-yet-due = the 0-30 bucket.

2. Push the numbers into Orbit with the Orbit tool update_field_service_snapshot:
   - workspace: "adapt-pest-pros"
   - today: one entry per job with id, title (the service or job name), start_at (the job's scheduled start as ISO 8601), end_at if known, completed (true if the job's status says completed), client (customer name), address, assignees (technician names).
   - requests_new = new leads count; quotes_awaiting = estimates pending {count,total}; invoices_past_due = overdue {count,total}; invoices_awaiting = 0-30 bucket {count,total}.
   - note: "Updated by Claude at <time> Pacific".

3. Finish with a two-line summary: what you pushed, and any problem. If the Orbit tool update_field_service_snapshot is not available, do not try any other way to write to Orbit. Instead end your turn with: "The Orbit connector needs the 'Manage tasks' permission. Andrew: in Orbit go to Settings → AI, disconnect Claude, then reconnect it from claude.ai and tick Manage tasks." If a LeadSprint call fails, say which one and stop.

Never create, edit or complete tasks, pages or anything else in Orbit, and never change anything in GorillaDesk or LeadSprint.
