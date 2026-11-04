# Lemon and Lavender Cleaning Co. — Residential Estimator

A Google Sheet your team uses to price a new Jobber request in a few minutes.
It prices every service at once (Initial Deep, Deluxe Deep, Move-In/Out,
Weekly, Bi-Weekly, Monthly), adds the add-ons, and writes a client-ready quote
you paste into Jobber. Zapier fills in new Jobber requests automatically.

| File | What it is |
|---|---|
| `LL_Residential_Estimator.xlsx` | The workbook. Import it into Google Drive as a Google Sheet. |
| `build_estimator.py` | Rebuilds the workbook from code (`python3 build_estimator.py`). |
| `pricing.py` | The same pricing logic in Python. Reference copy, and the engine for a future web app. |
| `test_estimator.py` | Rebuilds the sheet, recalculates it in LibreOffice and checks it matches `pricing.py` in 8 scenarios. |

---

## 1. Set it up (one time, ~10 minutes)

1. **Import into Google Sheets.** In Google Drive (the Lemon and Lavender account), go to
   **New ▸ File upload** and pick `LL_Residential_Estimator.xlsx`. Then double-click it and choose
   **Open with ▸ Google Sheets**, then **File ▸ Save as Google Sheets**. Delete the
   uploaded .xlsx afterward. Name the sheet **LL Residential Estimator**.
2. **Check it works.** The Quote tab should show the sample client "Jane Sample", a green
   **✅ Ready to quote** bar, and the prices in the worked example below.
3. **Share it** with the team (Editor access).
4. **Connect Zapier** (section 4) so new requests land on the Requests tab by themselves.
5. **Add the house-detail questions to your Jobber request form** (section 5).
   This is what saves the most time.
6. Once real requests are coming in, delete the sample row on the Requests tab.

## 2. Tabs (colored to match)

| Tab | Who uses it | What's on it |
|---|---|---|
| 🟪 **Quote** | Team, every quote | The only tab the team works in. Status bar at the top, 4 colored steps on the left, prices, quote message and Jobber line items on the right. |
| 🟨 **Requests** | Zapier adds one row per new Jobber request; the Save quote menu fills the yellow columns | Permanent history of every request. Rows are only ever added, never cleared. |
| 🟩 **Quote History** | The Save quote menu | One row per saved quote: every input, the dirt code, Low / Recommended / High / Your price for every service, and the full quote message. |
| (hidden) **Lists** | Nothing to touch | Feeds the newest-first client dropdown and the custom-quote types. |
| ⬛ **Breakdown** | Anyone curious | Read-only. What the price used, every step of the math for every service, add-ons, and the checks. |
| 🟦 **Settings** | Andrew only | Every number, in colored tables: ① Prices by service ② Jobber descriptions ③ Dirt code ④ People & pets ⑤ Time since last clean ⑥ Add-ons ⑦ Service area ⑧ Quote wording ⑨ Advanced. Blue cells are the editable ones. |
| 🟩 **Rate Card** | Reference | Your current rate card. The Breakdown tab shows its midpoints next to each estimate. |
| 🟧 **How To Use** | Team | The routine below, inside the sheet. |

## 3. Pricing a request (team routine)

The Quote tab uses three colors:
- **🟧 Orange box = always type this in.** Jobber can't send these answers (its API only shares
  text-box questions, and these are dropdowns on the request form). Read them on the Jobber request page:
  people, dogs, cats, other animals, last professional cleaning (a date or "never"), dirt code, and add-ons.
  The bar at the top lists any orange field that's still blank and turns green when they're all filled in.
- **🟨 Yellow box = only to add or fix something.**
- **⬜ Grey = filled in from the Jobber request.**

If you type in a yellow box, your answer wins over the grey one.

1. **① Pick the request.** Choose the client from the dropdown. Everything the request said fills in grey.
   For a phone call, leave it blank and type the details yourself.
2. **② The home.** Check square feet, beds, baths, people, pets and the last professional cleaning date. Fix anything that's wrong.
3. **③ Condition & photos.** Open the Jobber link, look at the photos, and enter the **dirt code** (1–11).
   The meaning of the code shows next to it. If the photos change your mind, fill in the **Photo check**
   rows: a new dirt code and/or a ±% price change, plus **why**.
4. **④ Add-ons & promo.** Fridge, oven, number of windows. Meta promos fill in by themselves.
5. **Look at the bar at the top:**
   - 🟩 **Ready to quote**: go ahead.
   - 🟧 **Not ready**: tells you exactly what's missing.
   - 🟥 **We do not service this home** (dirt code 11): no prices are shown, and the quote box becomes a polite decline message.
   - The line under the bar gives heads-ups: over 4,000 sq ft (walk-through), outside the service area, a photo change with no reason, missing beds/baths.
6. **Your prices.** Each service shows **Low · Recommended · High**. Low is 10% below and High is 15%
   above Recommended (both editable on Settings; Low never drops below the service minimum). Use judgment
   from the photos and the request, and type the price you'll quote in the yellow **Your price** box.
   Leave it blank to use Recommended. A warning appears if you type a price outside the range.
   Set **Put in quote?** to No for anything the client doesn't want. Copy the
   **quote message** into Jobber and add the **line items** (as optional items so the client picks one). Both use **Your price**.
7. **Log it** in the yellow columns on Requests.
8. **Clear the yellow boxes** you typed in before the next quote.

The Quote tab is shared, so one person quotes at a time. If two people need to quote at once,
one of them duplicates the tab (right-click ▸ Duplicate). This is the main limitation a web app would remove.

---

## 3a. Rooms (small extra time)

Step ② asks for **living / family rooms, kitchens, and bonus rooms & basements** (orange: type them from the Jobber
request). Square feet still drives the price. Rooms only add a little time:

- The base assumes **1 living room, 1 kitchen, 0 bonus rooms/basements**.
- Each room beyond that adds **3% time**, capped at **+15%** total.
- Example: 2 living rooms + 1 kitchen + 1 basement = 2 extra rooms = +6% time.
- All of it is on **Settings ▸ Rooms**, with a separate % per room type. The **Room Times** tab holds your
  Room-by-Room Cleaning Timeframe Sheet (minutes per room, per service) as a living reference to tune those %s.
- Custom quotes (step ⑤) skip the room factor, since you list those areas yourself.

## 3b. Custom quotes (only certain areas)

For a client who only wants part of the home cleaned, e.g. just the basement, use **step ⑤ Custom quote**:

1. Pick the **type of clean**: Deep, Move-out, Weekly, Bi-weekly or Monthly.
2. List each **area** with its **sq ft**. Add **extra hours** for anything square footage misses (inside cabinets, heavy cobwebs, clutter).
3. Only quoting these areas? Leave **Square feet** in step ② blank. The full-home prices hide, and the custom price shows.

It's priced the same way as everything else: area sq ft ÷ that service's cleaning speed, plus extra hours, × the
dirt code, people, pets and last-clean factors from steps ②–③, × the hourly rate. It shows as **Custom** in YOUR PRICES
with Low / Recommended / High and a Your price box. The minimum is **$250** for one-time custom jobs (Settings ▸
Custom quotes); recurring custom visits use that frequency's per-visit minimum.

## 3c. History: what's saved

- **Requests tab:** permanent. The automation only adds rows. The dropdown lists every request **newest first** as
  "Name · date", so repeat clients show up separately.
- **Quote tab:** a calculator. It doesn't keep anything until you **Save quote**.
- **Lemon and Lavender menu ▸ 💾 Save quote:** adds a row to **Quote History** and fills Status ("Quote sent"),
  Service Quoted, Price Quoted, Quoted By and Date Quoted on that client's Requests row.
- **Lemon and Lavender menu ▸ 🧹 Clear Quote tab for the next client:** resets the Quote tab after saving.

### Install the Save quote menu (one time, ~2 minutes)
1. Open the Sheet, go to **Extensions ▸ Apps Script**.
2. Delete what's there, paste the whole of [`apps_script/LemonAndLavenderQuotes.gs`](apps_script/LemonAndLavenderQuotes.gs), click **Save** (disk icon).
3. Go back to the Sheet and reload the page. A **Lemon and Lavender** menu appears next to Help.
4. The first time anyone uses it, Google asks them to authorize it. Click through (Advanced ▸ Go to project) once.

If an update ever moves cells on the Quote tab, I'll regenerate this file. Paste the new version the same way.

### Updating the estimator without losing history
Updates replace the Sheet's contents at the same link, which resets the Requests and Quote History tabs. Before
every update, copy the existing rows off both tabs, then add them back after. The Zapier workflow finds the Requests tab
by name, so it keeps working through updates.

## 4. Jobber → Sheet automation (Zapier)

**What I checked in your account (Nov 2, 2026):**
- **Meta lead-ad requests** come in through your existing Zap. They carry the house details in the
  request note as `Cleaning frequency: … | Bedrooms: … | Bathrooms: … | Square footage: … sq ft`.
  The sheet reads that format automatically.
- **Website / Jobber form requests** (`source = external`), including Andrew's test request, arrived with
  contact info and address only. The form answers were **not** in the request's notes. So either
  the form doesn't ask for them yet (section 5 fixes that), or Jobber keeps them in a part of the
  request Zapier's trigger may or may not expose. **Check this in step 4 of Zap A.**
- Jobber attached the test request to an existing client named `New Call [+1737…]` because the
  email matched. **Map the request's contact name, not the client name**, so the sheet shows the real person.

### Zap A — every new Jobber request → Requests tab
1. Trigger: **Jobber ▸ New Request Created**.
2. *(Optional)* Filter: only continue if **Source** does not contain `Zapier`, if you'd rather Zap B
   handle Meta leads (see below). Without the filter, Meta leads come through here too. That's fine as long as the request note maps into Details.
3. Action: **Google Sheets ▸ Create Spreadsheet Row**. Spreadsheet: *LL Residential Estimator*. Worksheet: *Requests*.
4. Map the fields (use whatever names Zapier's trigger shows for these; run **Test trigger** on your test request and look at what's there):

| Requests column | Jobber field |
|---|---|
| A Received | Created At |
| B Jobber Request ID | ID |
| C Jobber Link | Jobber Web URI (request link) |
| D Source | Source |
| E Client Name | **Contact name** (fall back to client name) |
| F Email / G Phone | Contact email / phone |
| H Street / I City / J State / K Zip | Property address street1 / city / province / postal code |
| L Request Title | Title |
| M Details | Request note text **and/or** form answers. See the format below. |
| N Photo Links | Attachment URLs, if the trigger exposes them |

5. Turn it on, submit another test, and confirm the row appears and the Quote tab dropdown finds it.

**Details format.** The sheet reads `Label: value` pairs separated by ` | ` (or new lines). When you
map form answers in Zapier, type this template into the Details field and drop the answer
fields in after each label:

```
Service requested: … | Square footage: … | Bedrooms: … | Bathrooms: … | People in home: … | Dogs: … | Cats: … | Other animals: … | Last professional cleaning: YYYY-MM-DD
```

Labels the sheet recognizes: `Square footage:` `Bedrooms:` `Bathrooms:` `People in home:` `Dogs:`
`Cats:` `Other animals:` `Last professional cleaning:` `Cleaning frequency:` `Service requested:`
and `Offer: $NN off` (Meta promos auto-fill the promo cell).

### Zap B — Meta leads (only if you added the filter in Zap A)
In your existing Meta-lead Zap, add one more step after "Create Request in Jobber":
**Google Sheets ▸ Create Spreadsheet Row** with the same mapping, and the same note text you
already send to Jobber in **Details**.

**Zapier cost:** 1–2 tasks per request.

### If Jobber's trigger doesn't expose the form answers
Move the website form to a form tool that sends straight to Zapier (Jotform, Google Forms,
or your site builder's form). Have one Zap create the Jobber request and the sheet row at the same time,
the same way your Meta leads already work. That gives you full control over the fields and photo uploads.

---

## 5. Jobber request form questions to add

Jobber ▸ Settings ▸ Requests ▸ Online request form. Use these labels so they line up with the sheet:

| Question | Type |
|---|---|
| Service requested | Dropdown: Initial Deep Clean, Deluxe Deep Clean, Move-In/Move-Out, Weekly, Bi-Weekly, Monthly, Not sure |
| Square footage | Number |
| Bedrooms | Number |
| Bathrooms | Number (allow .5) |
| People in home | Number |
| Dogs / Cats / Other animals | Number (three questions) |
| Last professional cleaning | Date ("leave blank if never") |
| Add-ons | Checkboxes: Inside fridge, Inside oven, Interior windows |
| Photos of kitchen, bathrooms and main living area | Image upload |

Add the same questions to the Meta lead form where Meta allows it.

---

## 6. How the price is calculated

Built on the rate card ("1 NEW L&L Rate Card Residential ONLY"):

> **Hours = Sq Ft ÷ production rate · Price = Hours × rate, rounded up to $5, never below the minimum.**

The Estimator follows that method and extends it. Each step is shown per service on the Breakdown tab:

```
labor hours = CEILING( (sqft ÷ production rate + extra-bath hours)
                       × scope × dirt factor × people factor × pet factor × last-clean factor , 0.25 )
price       = MAX( CEILING( labor hours × billable rate × (1 + photo adj %), $5 ), service minimum )
quoted      = price − promo (Initial Deep only) + add-ons
```

**How frequency changes recurring price.** It comes straight from the rate card's production rates.
A weekly home takes less time per sq ft than a monthly one:

| | Monthly | Bi-Weekly | Weekly |
|---|---|---|---|
| Sq ft per labor hour | 650 | 775 | 850 |
| Visit time vs. Monthly | 100% | 84% | 76% |
| Minimum per visit | $150 | $110 | $110 |

### Settings defaults and where they came from

| Setting | Default | Source |
|---|---|---|
| Production rates | 650 / 775 / 850 / 300 / 300 / 275 sq ft/hr | Rate card (Deluxe uses the deep rate) |
| Billable rate | $80 recurring, $90 deep / deluxe / move | Andrew (the card still says $85) |
| Minimums | $150 / $110 / $110 / $400 / $400 / $450; $250 trip minimum on one-time jobs | Rate card methodology list |
| Deluxe Deep | Initial Deep hours × 1.25 | **Assumption.** The card has only one deep service |
| Dirt code | 1 → 0.90 … 5 → 1.00 … 10 → 1.40 (hours). 11 = no estimate | **Assumption.** Full effect on one-time cleans, half on recurring |
| People | +3% per person over 2, max +15% | **Assumption** (card: "use high end for kids") |
| Pets | +3% per dog, +2% per cat, +1% per other animal, max +20% | **Assumption** (card: "use high end for pets") |
| Last pro clean | <1 mo 1.00 · 1–3 1.05 · 3–6 1.10 · 6–12 1.15 · 12+ or never 1.20 | **Assumption.** One-time cleans only |
| Extra bathrooms | Baths beyond 1 per 750 sq ft add 0.25 hr (recurring) / 0.5 hr (one-time) | **Assumption.** The card doesn't use beds/baths |
| Move-In/Out | People and pet factors off (empty home) | **Assumption** |
| Add-ons at $90/hr | Fridge 0.75 hr ($70), oven 1 hr ($90), windows 0.10 hr each | **Assumption.** The card's add-on section is blank |
| Hours vs. team | Rate card hours = total labor hours; on-site = hours ÷ 2 | **Assumption** |
| Rounding | Hours up to 0.25; price up to $5 | Card (price); assumption (hours) |

The rate card inconsistencies (deep/move tables vs. formula, conflicting minimums, blank add-ons and so on)
were emailed to Andrew on Nov 2, 2026. The Rate Card tab and the "vs. rate card" row on the Breakdown tab let you
see the gap on every quote while you decide.

---

## 7. Worked example (ships in the sheet)

**Inputs.** Sample Meta request: 1,850 sq ft, 3 bed / 2.5 bath, Milwaukie, biweekly interest, $50-off promo.
The team added: 4 people, 1 dog, 1 cat, last pro clean 2026-03-01 (about 8 months → 1.15), dirt code 6,
photo review raised it to **7** ("kitchen grease and pet hair"), inside fridge, 12 interior windows.

**Factors.** Dirt 7 = 1.16 (recurring 1.08). People = 1 + (4−2)×3% = 1.06. Pets = 1 + 3% + 2% = 1.05.
Extra baths = 2.5 − 1,850/750 = 0.03.

| | Monthly | Bi-Weekly | Weekly | Initial Deep | Deluxe Deep | Move-In/Out |
|---|---|---|---|---|---|---|
| Base hours (sq ft ÷ rate) | 2.85 | 2.39 | 2.18 | 6.17 | 6.17 | 6.73 |
| × scope · dirt · people · pets · last clean | 1.08·1.06·1.05 | same | same | 1.16·1.06·1.05·1.15 | ×1.25 too | 1.16·1.15 |
| **Labor hours** (rounded up to ¼) | 3.50 | 3.00 | 2.75 | 9.25 | 11.50 | 9.00 |
| × rate | $80 | $80 | $80 | $90 | $90 | $90 |
| **Service price** | **$280** | **$240** | **$220** | **$835** | **$1,035** | **$810** |
| Promo | | | | −$50 → **$785** | | |
| On-site time, team of 2 | 1.75 h | 1.5 h | 1.4 h | 4.6 h | 5.75 h | 4.5 h |
| Rate card midpoint ($85, 1,801–2,200) | $275 | $235 | $215 | $645 | n/a | $720 |

Add-ons: fridge 0.75 h × $90 = $67.50 → **$70**; 12 windows × 0.10 h × $90 = $108 → **$110**; total **$180** per visit.

Quote text the sheet generates:

```
Hi Jane,

Thanks for reaching out to Lemon and Lavender Cleaning Co.! Based on your 1,850 sq ft home (3 bed / 2.5 bath) at 1234 SE Sample St, here are your estimated prices:

ONE-TIME CLEANS
• Initial Deep Clean: $785 (includes $50 off promo)
• Deluxe Deep Clean: $1,035
• Move-In / Move-Out Clean: $810

RECURRING MAINTENANCE (per visit, after an initial deep clean)
• Weekly: $220
• Every 2 weeks: $240
• Monthly: $280

ADD-ONS (per visit)
• Inside refrigerator: $70
• Interior windows (12): $110

These estimates are based on the details you shared. If the home's condition is noticeably different when we arrive, we'll talk with you before any change in price. Let us know which option works best and we'll get you on the schedule!
```

**Checking it against the rate card.** Recurring prices land within $5 of the card's midpoints, even
though this home is dirtier than average, because $80/hr is below the card's $85. The deep and move prices
are higher than the card mainly because of this home's condition (dirt 7, pets, 8 months since the last clean). An average home
(dirt 5, 2 people, no pets, professionally cleaned within the last month) at 1,850 sq ft prices Initial Deep at **$565**, Move-In/Out at **$610**,
and Monthly / Bi-Weekly / Weekly at **$240 / $200 / $180**.
That's *below* the card's $645 / $720 midpoints, because the card's own tables run higher than its formula (emailed issue #1).

---

## 8. Later: moving to a web app

The design keeps that move cheap:
- `pricing.py` is the engine. Settings map 1:1 to `DEFAULT_SETTINGS`.
- The Requests tab columns are the request record. Zapier can send the same fields to a web app
  through a webhook instead of a sheet row.
- Phase 2 for a web app: a "Send to Jobber" button that creates a draft quote on the client's property through
  Jobber's API, a request inbox, photo thumbnails, and no "one person at a time" limit.

## Running the tests

```bash
cd cleaning-estimator
pip install openpyxl pytest
python3 build_estimator.py
python3 -m pytest -q test_estimator.py
```
