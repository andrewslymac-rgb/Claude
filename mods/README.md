# Claude mods

Three Claude Code mods for running Adapt Pest Pros, Lemon and Lavender Cleaning Co., and Clever Vending.

| Mod | What it does |
| --- | --- |
| `business-pulse` | A side panel with one card per business: Adapt's LSA leads and spend, GorillaDesk billed/collected and A/R aging, Lemon and Lavender's Jobber visits and open quotes, and month-to-date P&L from each QuickBooks company. Refreshes every 30 minutes, or with the Refresh button or `/pulse`. |
| `guard-rails` | Before Claude sends an email or text, runs or changes payroll, voids/deletes in QuickBooks, sends invoices or signature requests, shares or trashes files, changes live ads, or deploys a site, it shows what's about to happen and asks **Approve** or **Cancel**. Reads and drafts pass straight through. |
| `books-status` | A status line showing which business's QuickBooks Claude is in (`📒 Books: Clever Vending`), with a heads-up toast when writes switch from one company's books to another. |

The mods reach your data through the connectors already set up in Claude (LeadSprint, Jobber, and the three QuickBooks Labs connections), so they need no keys of their own.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install business-pulse --marketplace andrewslymac-rgb/Claude
/plugin install guard-rails --marketplace andrewslymac-rgb/Claude
/plugin install books-status --marketplace andrewslymac-rgb/Claude
```

Answer `y` to add the marketplace, then pick the user scope.

From a shell: `claude plugin install <mod> --marketplace andrewslymac-rgb/Claude`.

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `andrewslymac-rgb/Claude` → **Add plugin**.
