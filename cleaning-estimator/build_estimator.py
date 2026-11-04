"""Build the Lemon and Lavender Cleaning Co. estimator workbook (.xlsx).

    python3 cleaning-estimator/build_estimator.py    # -> LL_Residential_Estimator.xlsx

Tabs
    Quote       - the only tab the team works in: 4 colored steps + prices + quote text
    Requests    - filled by Zapier from Jobber; team logs the outcome
    Breakdown   - read-only: what the price used and every calculation step
    Settings    - every number, in colored tables by topic (Andrew only)
    Rate Card   - reference copy of the current rate card
    How To Use  - the routine

pricing.py holds the same logic in Python; test_estimator.py checks they agree.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, str(Path(__file__).parent))
from pricing import DEFAULT_SETTINGS as S  # noqa: E402

OUT = Path(__file__).parent / "LL_Residential_Estimator.xlsx"

# ------------------------------------------------------------------ palette
PURPLE, PURPLE_T = "6B4E9B", "E8E1F2"   # step 1 / brand / one-time
BLUE, BLUE_T = "2F75B5", "DDEBF7"       # step 2
ORANGE, ORANGE_T = "C65911", "FCE4D6"   # step 3
GREEN, GREEN_T = "548235", "E2EFDA"     # step 4 / recurring
GOLD, GOLD_T = "BF8F00", "FFF2CC"
SLATE, SLATE_T = "595959", "EDEDED"
ANSWER = "FFF2CC"                       # yellow = type here
MANUAL = "F8CBAD"                       # orange = always typed in (Jobber can't send it)
MANUAL_DARK = "C65911"
AUTO = "F2F2F2"                         # grey = filled automatically
EDIT = "DDEBF7"                         # blue = editable setting
WHITE = "FFFFFF"

thin = Side(style="thin", color="BFBFBF")
med = Side(style="medium", color="BF8F00")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
ANSWER_BOX = Border(left=med, right=med, top=med, bottom=med)
thick_orange = Side(style="thick", color="C65911")
MANUAL_BOX = Border(left=thick_orange, right=thick_orange, top=thick_orange, bottom=thick_orange)

MONEY = '"$"#,##0'
MONEY2 = '"$"#,##0.00'
HRS = "0.00"
PCT = "0%"
WRAP = Alignment(wrap_text=True, vertical="center")
WRAP_TOP = Alignment(wrap_text=True, vertical="top")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
RIGHT = Alignment(horizontal="right", vertical="center")

SVC_COLS = ["C", "D", "E", "F", "G", "H"]  # SERVICES order in pricing.py
SVC_NAMES = ["Monthly", "Bi-Weekly", "Weekly", "Initial Deep", "Deluxe Deep", "Move-In/Out"]

BD = "Breakdown"


def fill(c):
    return PatternFill("solid", start_color=c, end_color=c)


def font(size=11, bold=False, color="000000", italic=False):
    return Font(size=size, bold=bold, color=color, italic=italic)


def put(ws, ref, value=None, bg=None, f=None, fmt=None, border=BOX, align=None):
    c = ws[ref]
    if value is not None:
        c.value = value
    if bg:
        c.fill = fill(bg)
    if f:
        c.font = f
    if fmt:
        c.number_format = fmt
    if border:
        c.border = border
    if align:
        c.alignment = align
    return c


def band(ws, rng, text, color, size=12, height=22):
    first = rng.split(":")[0]
    ws.merge_cells(rng)
    put(ws, first, text, color, font(size, True, WHITE), border=None,
        align=Alignment(vertical="center", indent=1))
    ws.row_dimensions[ws[first].row].height = height


# ================================================================ SETTINGS
class Ref:
    """Remembers where each setting landed: ref['team_size'] -> 'Settings!$C$40'."""

    def __init__(self):
        self.cell = {}
        self.row = {}

    def __getitem__(self, k):
        return self.cell[k]


def build_settings(wb) -> Ref:
    ws = wb.create_sheet("Settings")
    ref = Ref()
    ws.sheet_view.showGridLines = False
    for k, v in {"A": 2, "B": 46, "C": 14, "D": 14, "E": 14, "F": 14, "G": 14, "H": 15, "I": 52}.items():
        ws.column_dimensions[k].width = v
    ws.merge_cells("B1:I1")
    put(ws, "B1", "SETTINGS — change prices and assumptions here", PURPLE, font(16, True, WHITE), border=None,
        align=Alignment(vertical="center", indent=1))
    ws.row_dimensions[1].height = 30
    ws.merge_cells("B2:I2")
    put(ws, "B2", "Only the BLUE cells are meant to be changed. Every quote updates instantly. "
        "Grey notes say where each number came from.", border=None, f=font(10, italic=True, color=SLATE))

    r = 4

    def svc_table(title, color, tint, rows, note):
        nonlocal r
        band(ws, f"B{r}:I{r}", title, color)
        r += 1
        put(ws, f"B{r}", "", tint, font(bold=True))
        for col, name in zip(SVC_COLS, SVC_NAMES):
            put(ws, f"{col}{r}", name, tint, font(bold=True), align=CENTER)
        put(ws, f"I{r}", "Where it came from", tint, font(bold=True))
        r += 1
        for key, label, fmt, src in rows:
            put(ws, f"B{r}", label, align=WRAP)
            for i, col in enumerate(SVC_COLS):
                put(ws, f"{col}{r}", S[key][i] if key in S else key_default(key, i), EDIT, fmt=fmt,
                    align=CENTER)
            put(ws, f"I{r}", src, f=font(9, italic=True, color=SLATE), align=WRAP)
            ref.row[key] = r
            r += 1
        if note:
            ws.merge_cells(f"B{r}:I{r}")
            put(ws, f"B{r}", note, border=None, f=font(9, italic=True, color=SLATE))
            r += 1
        r += 1

    def list_table(title, color, tint, rows):
        nonlocal r
        if title:
            band(ws, f"B{r}:I{r}", title, color)
            r += 1
        put(ws, f"B{r}", "Setting", tint, font(bold=True))
        put(ws, f"C{r}", "Value", tint, font(bold=True), align=CENTER)
        ws.merge_cells(f"D{r}:I{r}")
        put(ws, f"D{r}", "Where it came from / what it does", tint, font(bold=True))
        r += 1
        for key, label, fmt, src in rows:
            put(ws, f"B{r}", label, align=WRAP)
            put(ws, f"C{r}", S[key], EDIT, fmt=fmt, align=CENTER)
            ws.merge_cells(f"D{r}:I{r}")
            put(ws, f"D{r}", src, f=font(9, italic=True, color=SLATE), align=WRAP)
            ref.cell[key] = f"Settings!$C${r}"
            r += 1
        r += 1

    # 1 — prices by service
    svc_table("1  PRICES BY SERVICE", PURPLE, PURPLE_T, [
        ("billable_rate", "Hourly rate ($ per labor hour)", MONEY, "Andrew, Nov 2026 ($85 on the old rate card)"),
        ("minimum_price", "Minimum price per visit", MONEY, "Rate card minimums"),
        ("production_rate", "Cleaning speed (sq ft per labor hour)", "#,##0",
         "Rate card. Faster speed = less time = lower price. This is how frequency changes recurring prices."),
        ("scope_multiplier", "Time multiplier (1.25 = 25% more time)", "0.00",
         "Assumption: Deluxe = Initial Deep + 25% (baseboards, blinds, inside cabinets, door frames)"),
    ], "Price = (sq ft ÷ cleaning speed) × adjustments × hourly rate, rounded up to $5, never below the minimum.")

    # line descriptions (text, per service)
    band(ws, f"B{r}:I{r}", "2  JOBBER LINE ITEM DESCRIPTIONS", PURPLE)
    r += 1
    put(ws, f"B{r}", "Description shown on the Jobber quote", align=WRAP)
    descs = ["Recurring maintenance clean, once a month",
             "Recurring maintenance clean, every 2 weeks",
             "Recurring maintenance clean, every week",
             "Full top-to-bottom reset clean; first visit before recurring service",
             "Initial deep clean plus baseboards, blinds, inside cabinets and door frames",
             "Top-to-bottom clean of an empty or nearly empty home"]
    for col, d in zip(SVC_COLS, descs):
        put(ws, f"{col}{r}", d, EDIT, f=font(9), align=WRAP)
    ws.row_dimensions[r].height = 62
    ref.row["desc"] = r
    r += 2

    # 3 — dirt code
    band(ws, f"B{r}:I{r}", "3  HOME CONDITION (DIRT CODE)", ORANGE)
    r += 1
    put(ws, f"B{r}", "Dirt code", ORANGE_T, font(bold=True), align=CENTER)
    put(ws, f"C{r}", "Time ×", ORANGE_T, font(bold=True), align=CENTER)
    ws.merge_cells(f"D{r}:I{r}")
    put(ws, f"D{r}", "What it looks like", ORANGE_T, font(bold=True))
    r += 1
    looks = {1: "Cleanest home you've ever seen", 2: "Spotless, lightly lived in", 3: "Tidy, light dust",
             4: "Well kept, normal dust", 5: "Average lived-in home",
             6: "Visible dust, some buildup in kitchen and baths",
             7: "Noticeable grime, pet hair, cluttered surfaces", 8: "Heavy buildup in kitchen and baths, clutter",
             9: "Very heavy buildup, grease, soap scum, clutter throughout",
             10: "Heaviest we take: buildup, debris, grime and clutter everywhere",
             11: "WE DO NOT SERVICE (biohazard, hoarding). No estimate."}
    ref.row["dirt_first"] = r
    for code in range(1, 12):
        put(ws, f"B{r}", code, align=CENTER, f=font(bold=True))
        if code <= 10:
            put(ws, f"C{r}", S["dirt_multiplier"][code], EDIT, fmt="0.00", align=CENTER)
        else:
            put(ws, f"C{r}", "—", "C00000", font(bold=True, color=WHITE), align=CENTER)
        ws.merge_cells(f"D{r}:I{r}")
        put(ws, f"D{r}", f"{code} = {looks[code]}", "FCE4D6" if code == 11 else None)
        r += 1
    ref.row["dirt_last"] = r - 1
    ws.merge_cells(f"B{r}:I{r}")
    put(ws, f"B{r}", "Assumption: code 5 = the rate card price. Recurring visits feel half the effect "
        "(see Advanced).", border=None, f=font(9, italic=True, color=SLATE))
    r += 2

    # 4 — people, pets, last clean
    list_table("4  PEOPLE & PETS", GREEN, GREEN_T, [
        ("occupants_included", "People included in the base price", "0", "Assumption. Also used when unknown."),
        ("per_extra_occupant", "Extra time for each additional person", PCT, "Assumption (rate card: kids = high end)"),
        ("occupant_cap", "Most extra time for people", PCT, "Assumption"),
        ("per_dog", "Extra time per dog", PCT, "Assumption (rate card: pets = high end)"),
        ("per_cat", "Extra time per cat", PCT, "Assumption"),
        ("per_other_animal", "Extra time per other animal", PCT, "Assumption"),
        ("pet_cap", "Most extra time for pets", PCT, "Assumption"),
    ])
    band(ws, f"B{r}:I{r}", "5  TIME SINCE LAST PROFESSIONAL CLEAN (one-time cleans)", GREEN)
    r += 1
    put(ws, f"B{r}", "If it's been at least … months", GREEN_T, font(bold=True))
    put(ws, f"C{r}", "Time ×", GREEN_T, font(bold=True), align=CENTER)
    r += 1
    ref.row["band_first"] = r
    for months, factor in S["last_clean_bands"]:
        put(ws, f"B{r}", months, EDIT, align=CENTER)
        put(ws, f"C{r}", factor, EDIT, fmt="0.00", align=CENTER)
        r += 1
    ref.row["band_last"] = r - 1
    ws.merge_cells(f"B{r}:I{r}")
    put(ws, f"B{r}", "Assumption. Keep months smallest to largest. A blank date counts as 24 months (see Advanced).",
        border=None, f=font(9, italic=True, color=SLATE))
    r += 2

    # 6 — add-ons
    list_table("PRICE RANGE SHOWN TO THE TEAM", PURPLE, PURPLE_T, [
        ("range_low_pct", "Low end: this much below Recommended", PCT,
         "Andrew Nov 2026: show a range so the team uses judgment. Low never goes below the service minimum."),
        ("range_high_pct", "High end: this much above Recommended", PCT, "Andrew Nov 2026"),
    ])
    list_table("6  ADD-ONS", GOLD, GOLD_T, [
        ("addon_rate", "Add-on hourly rate", MONEY, "Assumption — the rate card's add-on section is blank"),
        ("fridge_hours", "Inside refrigerator (hours)", "0.00", "Assumption: 0.75 hr ≈ $70"),
        ("oven_hours", "Inside oven (hours)", "0.00", "Assumption: 1 hr = $90"),
        ("window_hours_each", "Interior windows (hours per window)", "0.00", "Assumption: 0.10 hr ≈ $9 per window"),
    ])

    # 7 — service area
    band(ws, f"B{r}:I{r}", "7  SERVICE AREA (cities we serve)", PURPLE)
    r += 1
    ref.row["area_first"] = r
    for i in range(12):
        put(ws, f"B{r}", S["service_area"][i] if i < len(S["service_area"]) else None, EDIT)
        r += 1
    ref.row["area_last"] = r - 1
    ws.merge_cells(f"B{r}:I{r}")
    put(ws, f"B{r}", "Add cities in the empty blue cells. Other cities get an 'outside service area' warning.",
        border=None, f=font(9, italic=True, color=SLATE))
    r += 2

    # 8 — wording
    band(ws, f"B{r}:I{r}", "8  QUOTE WORDING", PURPLE)
    r += 1
    for key, label, text in [
        ("closing", "Closing paragraph of every quote",
         "These estimates are based on the details you shared. If the home's condition is noticeably "
         "different when we arrive, we'll talk with you before any change in price. Let us know which "
         "option works best and we'll get you on the schedule!"),
        ("decline", "Decline message (dirt code 11)",
         "Thank you for reaching out to Lemon and Lavender Cleaning Co. After reviewing the details of "
         "your home, we're not able to take on this cleaning. It falls outside the type of service our "
         "team is equipped to provide. We're sorry we can't help this time, and we appreciate you "
         "thinking of us."),
    ]:
        put(ws, f"B{r}", label, align=WRAP)
        ws.merge_cells(f"C{r}:I{r}")
        put(ws, f"C{r}", text, EDIT, align=WRAP)
        ws.row_dimensions[r].height = 50
        ref.cell[key] = f"Settings!$C${r}"
        r += 1
    r += 1

    # 9 — advanced
    svc_table("9  ADVANCED — rarely changed", SLATE, SLATE_T, [
        ("extra_bath_hours", "Extra time per extra bathroom (hours)", "0.00",
         "Assumption: bathrooms beyond 1 per 750 sq ft add time"),
        ("dirt_sensitivity", "How much dirt code counts (1 = full, 0.5 = half)", "0.00",
         "Assumption: recurring homes are already reset by the initial deep clean"),
        ("household_factors_apply", "People & pets count? (1 = yes, 0 = no)", "0", "Assumption: Move-In/Out = empty home"),
        ("last_clean_applies", "Last-clean date counts? (1 = yes, 0 = no)", "0", "Assumption: one-time cleans only"),
        ("one_time", "One-time job? (1 = yes) — gets the trip minimum", "0", ""),
    ], None)
    r -= 1
    list_table("", SLATE, SLATE_T, [
        ("trip_minimum_one_time", "Trip minimum for any one-time job", MONEY, "Rate card"),
        ("team_size", "Cleaners per team (for time on site)", "0", "Assumption: card hours = total labor hours"),
        ("sqft_per_included_bath", "Sq ft per bathroom included in base time", "#,##0", "Assumption"),
        ("hours_rounding", "Round labor hours up to nearest", "0.00", "Assumption"),
        ("price_rounding", "Round prices up to nearest $", MONEY, "Rate card"),
        ("walkthrough_sqft", "Walk-through required above (sq ft)", "#,##0", "Rate card: custom quote over 4,000"),
        ("min_sqft", "Smallest sq ft allowed", "#,##0", "Typo check"),
        ("max_sqft", "Largest sq ft allowed", "#,##0", "Typo check"),
        ("months_if_unknown", "Months to assume when last-clean date is blank", "0", "Assumption: blank = never"),
    ])
    ws.freeze_panes = "A3"

    # convenience refs for per-service rows
    for key in ["billable_rate", "minimum_price", "production_rate", "scope_multiplier", "extra_bath_hours",
                "dirt_sensitivity", "household_factors_apply", "last_clean_applies", "one_time", "desc"]:
        ref.cell[key + "_row"] = ref.row[key]
    ref.cell["dirt_table"] = f"Settings!$B${ref.row['dirt_first']}:$D${ref.row['dirt_last']}"
    ref.cell["bands_m"] = f"Settings!$B${ref.row['band_first']}:$B${ref.row['band_last']}"
    ref.cell["bands_f"] = f"Settings!$C${ref.row['band_first']}:$C${ref.row['band_last']}"
    ref.cell["area"] = f"Settings!$B${ref.row['area_first']}:$B${ref.row['area_last']}"
    return ref


def key_default(key, i):  # placeholder for non-pricing per-service rows
    return None


def svc(ref: Ref, key: str, col: str) -> str:
    return f"Settings!${col}${ref.row[key]}"


# ================================================================ REQUESTS
REQ_COLS = [
    ("Received", 18), ("Jobber Request ID", 16), ("Jobber Link", 30), ("Source", 12),
    ("Client Name", 22), ("Email", 24), ("Phone", 15), ("Street", 26), ("City", 14),
    ("State", 8), ("Zip", 8), ("Request Title", 28), ("Details (form answers / notes)", 60),
    ("Photo Links", 30),
    ("Status", 16), ("Service Quoted", 20), ("Price Quoted", 12), ("Quoted By", 12),
    ("Date Quoted", 12), ("Team Notes", 30),
]


def build_requests(wb):
    ws = wb.create_sheet("Requests")
    for i, (name, w) in enumerate(REQ_COLS, start=1):
        col = get_column_letter(i)
        ws.column_dimensions[col].width = w
        team = i >= 15
        put(ws, f"{col}1", name, GOLD_T if team else PURPLE, font(bold=True, color="000000" if team else WHITE),
            align=CENTER)
    ws.row_dimensions[1].height = 34
    ws.freeze_panes = "B2"
    sample = [
        "2026-11-02 09:15", "SAMPLE-0001", "https://secure.getjobber.com/work_requests/SAMPLE", "Zapier",
        "Jane Sample", "jane@example.com", "(503) 555-0142", "1234 SE Sample St", "Milwaukie", "OR",
        "97222", "Meta — FALL26 Initial Deep Clean Quote",
        "Source: Meta FALL26 lead ad. Offer: $50 off initial deep clean; book by November 15, 2026. "
        "Move-in/out excluded.\nCleaning frequency: Biweekly | Bedrooms: 3 | Bathrooms: 2.5 | "
        "Square footage: 1,850 sq ft | Service address: 1234 SE Sample St",
        "", "Priced", "", "", "", "", "SAMPLE ROW — delete once real requests arrive",
    ]
    for i, v in enumerate(sample, start=1):
        c = ws.cell(row=2, column=i, value=v)
        c.alignment = Alignment(vertical="top", wrap_text=(i == 13))
        if i >= 15:
            c.fill = fill(ANSWER)
    ws.row_dimensions[2].height = 60
    dv = DataValidation(type="list", allow_blank=True,
                        formula1='"New,Priced,Quote sent,Won,Lost,Declined (code 11),Out of area"')
    ws.add_data_validation(dv)
    dv.add("O2:O2000")
    for col in "OPQRST":
        for rr in range(3, 202):
            ws[f"{col}{rr}"].fill = fill(ANSWER)
    ws["Q2"].number_format = MONEY
    # status colors
    for text, color in [("Won", "C6EFCE"), ("Lost", "F2F2F2"), ("Declined", "FFC7CE"), ("Quote sent", "DDEBF7"),
                        ("New", "FFEB9C")]:
        ws.conditional_formatting.add("O2:O2000", FormulaRule(formula=[f'ISNUMBER(SEARCH("{text}",$O2))'],
                                                               fill=fill(color)))


# ================================================================ RATE CARD
RATE_CARD = [  # band min, max, label, (range, midpoint) x Monthly, Bi-weekly, Weekly, Deluxe, Move
    (0, 1000, "Up to 1,000", ("$150 - $175", 160), ("$110 (min)", 110), ("$110 (min)", 110),
     ("$370 - $430", 400), ("$450 - $495", 450)),
    (1001, 1400, "1,001 - 1,400", ("$150 - $195", 180), ("$110 - $165", 145), ("$110 - $150", 135),
     ("$430 - $515", 475), ("$495 - $585", 540)),
    (1401, 1800, "1,401 - 1,800", ("$195 - $250", 225), ("$165 - $210", 190), ("$155 - $190", 175),
     ("$515 - $600", 560), ("$585 - $675", 630)),
    (1801, 2200, "1,801 - 2,200", ("$250 - $300", 275), ("$210 - $255", 235), ("$195 - $230", 215),
     ("$600 - $685", 645), ("$675 - $765", 720)),
    (2201, 2600, "2,201 - 2,600", ("$300 - $350", 325), ("$255 - $300", 280), ("$235 - $270", 255),
     ("$685 - $810", 750), ("$765 - $900", 835)),
    (2601, 3200, "2,601 - 3,200", ("$355 - $430", 395), ("$300 - $365", 335), ("$275 - $330", 305),
     ("$810 - $980", 895), ("$900 - $1035", 970)),
    (3201, 4000, "3,201 - 4,000", ("$430 - $535", 485), ("$365 - $450", 410), ("$335 - $410", 375),
     ("$980 - $1195", 1090), ("$1035 - $1215", 1125)),
]


def build_rate_card(wb):
    ws = wb.create_sheet("Rate Card")
    ws.sheet_view.showGridLines = False
    ws.merge_cells("A1:M1")
    put(ws, "A1", "RATE CARD — reference only (from '1 NEW L&L Rate Card Residential ONLY')", PURPLE,
        font(14, True, WHITE), border=None, align=Alignment(vertical="center", indent=1))
    ws.row_dimensions[1].height = 28
    ws.merge_cells("A2:M3")
    put(ws, "A2", "Card method: Hours = Sq Ft ÷ speed; Price = Hours × $85, rounded up to $5, never below the "
        "minimum. The Quote tab uses the same method with the Settings tab numbers. The Breakdown tab shows these "
        "midpoints next to each estimate. Known inconsistencies were emailed to Andrew on 2026-11-02.",
        border=None, align=WRAP_TOP, f=font(10, italic=True, color=SLATE))
    heads = ["Band min sq ft", "Band max sq ft", "Home size",
             "Monthly range", "Monthly mid", "Bi-Weekly range", "Bi-Weekly mid", "Weekly range", "Weekly mid",
             "Deluxe range", "Deluxe mid", "Move In/Out range", "Move In/Out mid"]
    tints = [SLATE_T] * 3 + [GREEN_T] * 6 + [PURPLE_T] * 4
    for i, (h, t) in enumerate(zip(heads, tints), start=1):
        c = ws.cell(row=5, column=i, value=h)
        c.font = font(bold=True)
        c.fill = fill(t)
        c.border = BOX
        c.alignment = CENTER
        ws.column_dimensions[get_column_letter(i)].width = 14
    r = 6
    for row in RATE_CARD:
        vals = [row[0], row[1], row[2]]
        for rng, mid in row[3:]:
            vals += [rng, mid]
        for i, v in enumerate(vals, start=1):
            c = ws.cell(row=r, column=i, value=v)
            c.border = BOX
            c.alignment = CENTER
            if i in (5, 7, 9, 11, 13):
                c.number_format = MONEY
                c.font = font(bold=True)
        r += 1
    ws["A14"] = ("Rate card minimums: Monthly $150 · Bi-weekly $110 · Weekly $110 · Deep $400 · Move $450 · "
                 "One-time trip minimum $250")
    ws["A15"] = "Over 4,000 sq ft: custom quote, walk the home first."


# ================================================================ QUOTE (team tab)
# input name -> (row, label, tip, number format, default answer, from-request formula key)
Q = {}  # name -> answer cell on Quote, filled in build_quote
PRICE_ROWS: dict = {}  # Quote row -> Breakdown service column
MANUAL_FIELDS: dict = {}  # name -> True when Jobber can't send it (team types it in)


def build_quote(wb, ref: Ref):
    ws = wb.active
    ws.title = "Quote"
    ws.sheet_view.showGridLines = False
    ws.sheet_view.zoomScale = 110
    for k, v in {"A": 2, "B": 34, "C": 22, "D": 26, "E": 30, "F": 3,
                 "G": 27, "H": 10, "I": 13, "J": 10, "K": 12, "L": 10, "M": 11, "N": 2}.items():
        ws.column_dimensions[k].width = v

    def b(name):  # Breakdown value cell
        return BD_REF[name]

    # ---- title + status
    ws.merge_cells("B1:M1")
    put(ws, "B1", "Lemon and Lavender Cleaning Co.  ·  Quote Builder", PURPLE, font(18, True, WHITE), border=None,
        align=Alignment(vertical="center", indent=1))
    ws.row_dimensions[1].height = 36
    ws.merge_cells("B2:M2")
    put(ws, "B2", f'=IF({b("dnr")},"⛔  WE DO NOT SERVICE THIS HOME (dirt code 11) — no estimate. Copy the decline '
                  f'message below.",IF({b("errors")}<>"","⚠  Not ready: "&{b("errors")},"✅  Ready to quote"))',
        AUTO, font(14, True), border=None, align=Alignment(vertical="center", indent=1, wrap_text=True))
    ws.row_dimensions[2].height = 34
    ws.merge_cells("B3:M3")
    put(ws, "B3", f'=IF({b("warnings")}="","No warnings","Heads up: "&{b("warnings")})', None,
        font(10, color="833C0B"), border=None, align=Alignment(vertical="center", indent=1, wrap_text=True))
    ws.row_dimensions[3].height = 22
    for rule in [
        FormulaRule(formula=['ISNUMBER(SEARCH("DO NOT",$B$2))'], fill=fill("C00000"), font=font(14, True, WHITE)),
        FormulaRule(formula=['ISNUMBER(SEARCH("Not ready",$B$2))'], fill=fill("FFC000")),
        FormulaRule(formula=['ISNUMBER(SEARCH("Ready to quote",$B$2))'], fill=fill("C6EFCE"),
                    font=font(14, True, "006100")),
    ]:
        ws.conditional_formatting.add("B2:M2", rule)
    ws.conditional_formatting.add("B3:M3", FormulaRule(formula=['$B$3<>"No warnings"'], fill=fill("FCE4D6")))

    # ---- legend
    ws.merge_cells("B4:E4")
    put(ws, "B4", "🟧 ORANGE = always type in (Jobber can't send it)   🟨 Yellow = only to add or fix   "
        "⬜ Grey = filled in from the request", None, font(9, True, MANUAL_DARK), border=None,
        align=Alignment(vertical="center", wrap_text=True))
    ws.row_dimensions[4].height = 30

    # ---- steps
    def step(row, title, color):
        band(ws, f"B{row}:E{row}", title, color, 12, 24)

    def subhead(row, tint):
        for col, t in zip("BCDE", ["Question", "Your answer", "From the request", "Tip"]):
            put(ws, f"{col}{row}", t, tint, font(9, True, SLATE), align=CENTER if col in "CD" else None)

    def q(name, row, label, tint, tip="", fmt=None, default=None, auto=None, required=False, answer=True,
          manual=False):
        if manual:
            put(ws, f"B{row}", "✍ " + label + ("  *" if required else ""), MANUAL, font(11, True, "000000"),
                align=WRAP)
            put(ws, f"C{row}", default, MANUAL, font(11, True), fmt=fmt, border=MANUAL_BOX, align=CENTER)
            if auto is None:
                auto = "👉 Check Jobber request"
                put(ws, f"D{row}", auto, AUTO, font(10, True, MANUAL_DARK, italic=True), align=CENTER)
            else:
                put(ws, f"D{row}", auto, AUTO, font(10, italic=True, color=SLATE), fmt=fmt, align=CENTER)
        else:
            put(ws, f"B{row}", label + ("  *" if required else ""), tint, font(11, required), align=WRAP)
            if answer:
                put(ws, f"C{row}", default, ANSWER, font(11, True), fmt=fmt, border=ANSWER_BOX, align=CENTER)
            else:
                put(ws, f"C{row}", None, AUTO)
            put(ws, f"D{row}", auto, AUTO, font(10, italic=True, color=SLATE), fmt=fmt, align=CENTER)
        MANUAL_FIELDS[name] = manual
        put(ws, f"E{row}", tip, None, font(9, italic=True, color=SLATE), align=WRAP)
        ws.row_dimensions[row].height = 20
        Q[name] = f"C{row}"
        Q[name + "_auto"] = f"D{row}"

    req = lambda col: f'=IF({b("row_found")}="","",INDEX(Requests!${col}:${col},{b("row_found")})&"")'  # noqa: E731

    step(5, "①  PICK THE REQUEST", PURPLE)
    subhead(6, PURPLE_T)
    q("pick", 7, "Jobber request (client name)", PURPLE_T, "Pick from the list. Phone call? Leave blank.",
      default="Jane Sample", auto=f'=IF({b("row_found")}="","Not loaded","Loaded ✓")')
    q("client", 8, "Client name", PURPLE_T, auto=req("E"))
    q("street", 9, "Street address", PURPLE_T, auto=req("H"))
    q("city", 10, "City", PURPLE_T, "Checked against your service area.", auto=req("I"))
    q("link", 11, "Jobber link", PURPLE_T, "Open it to see the request and photos.", auto=req("C"), answer=False)

    step(13, "②  THE HOME", BLUE)
    subhead(14, BLUE_T)
    P = parse_formulas()
    q("sqft", 15, "Square feet", BLUE_T, "300 – 10,000. Over 4,000 = walk-through.", "#,##0",
      auto=P["sqft"], required=True)
    q("beds", 16, "Bedrooms", BLUE_T, fmt="0", auto=P["beds"])
    q("baths", 17, "Bathrooms", BLUE_T, "Half bath = 0.5", "0.0", auto=P["baths"])
    q("people", 18, "People living there", BLUE_T, "From the Jobber request. Type the number.", "0", manual=True)
    q("dogs", 19, "Dogs", BLUE_T, "Type 0 if none.", "0", manual=True)
    q("cats", 20, "Cats", BLUE_T, "Type 0 if none.", "0", manual=True)
    q("other", 21, "Other animals", BLUE_T, "Type 0 if none.", "0", manual=True)
    q("last_clean", 22, "Last professional cleaning", BLUE_T, "A date (3/1/2026) or type: never",
      "mm/dd/yyyy", manual=True)
    q("service", 23, "Service they asked about", BLUE_T, "Info only. Every service gets priced.",
      auto=P["service"])

    step(25, "③  CONDITION & PHOTOS", ORANGE)
    subhead(26, ORANGE_T)
    q("dirt", 27, "Dirt code (1 – 11)", ORANGE_T, "1 = cleanest ever · 5 = average · 10 = heavy · 11 = we don't "
      "service", "0", required=True, manual=True, auto=f'=IFERROR(VLOOKUP({b("dirt_used")},{ref["dirt_table"]},3,FALSE),"")')
    ws["D27"].alignment = WRAP
    ws.row_dimensions[27].height = 32
    q("photos", 28, "Photo links", ORANGE_T, "Paste links if they aren't in Jobber.", auto=req("N"))
    put(ws, "B29", "Photo check — fill in only if the photos changed your mind:", None,
        font(9, True, ORANGE), border=None)
    ws.merge_cells("B29:E29")
    q("photo_dirt", 30, "   New dirt code after photos", ORANGE_T, "Replaces the dirt code above.", "0")
    q("photo_pct", 31, "   Price change after photos", ORANGE_T, "e.g. 10% or -5%. Changes every price.", PCT)
    q("photo_why", 32, "   Why?", ORANGE_T, "Required if you changed anything.")
    ws.merge_cells("C32:D32")
    ws["C32"].alignment = Alignment(wrap_text=True, vertical="center")
    ws["C32"].font = font(10)
    ws.row_dimensions[32].height = 34

    step(34, "④  ADD-ONS & PROMO", GREEN)
    subhead(35, GREEN_T)
    q("fridge", 36, "Inside refrigerator", GREEN_T, "Check the Jobber request. Yes / No", default="No", manual=True)
    q("oven", 37, "Inside oven", GREEN_T, "Check the Jobber request. Yes / No", default="No", manual=True)
    q("windows", 38, "Interior windows (how many)", GREEN_T, "Check the Jobber request. 0 = none", "0", default=0,
      manual=True)
    q("promo", 39, "Promo $ off Initial Deep Clean", GREEN_T, "Fills in from Meta ads. Type 0 to remove.", MONEY,
      auto=P["promo"])

    # worked example answers
    for name, v in {"people": 4, "dogs": 1, "cats": 1, "other": 0, "last_clean": date(2026, 3, 1), "dirt": 6,
                    "photo_dirt": 7, "photo_why": "Kitchen grease and pet hair visible in photos",
                    "fridge": "Yes", "windows": 12}.items():
        ws[Q[name]] = v

    # ---- to-do bar: which orange fields are still blank
    todo_items = [("people", "People"), ("dogs", "Dogs"), ("cats", "Cats"), ("other", "Other animals"),
                  ("last_clean", "Last cleaning"), ("dirt", "Dirt code")]
    todo = "&".join(f'IF({Q[n]}="","{lbl}, ","")' for n, lbl in todo_items)
    ws.merge_cells("G4:M4")
    put(ws, "G4", f'=IF(({todo})="","✍ All orange fields filled in ✓","✍ Still to type in: "&LEFT(({todo}),'
                  f'LEN(({todo}))-2))', MANUAL, font(10, True), border=MANUAL_BOX,
        align=Alignment(vertical="center", wrap_text=True, indent=1))
    ws.conditional_formatting.add("G4:M4", FormulaRule(formula=['ISNUMBER(SEARCH("filled in",$G$4))'],
                                                       fill=fill("C6EFCE"), font=font(10, True, "006100")))

    # ---- prices panel: Low / Recommended / High + the team's own price
    band(ws, "G5:M5", "YOUR PRICES  ·  use the range + your judgment", PURPLE, 12, 24)
    for col, t in zip("GHIJKLM", ["Service", "Low", "Recommended", "High", "✍ Your price",
                                  "Time on site", "Put in quote?"]):
        put(ws, f"{col}6", t, ANSWER if col == "K" else PURPLE_T, font(9, True, SLATE), align=CENTER)
    put(ws, "G7", "One-time cleans", PURPLE_T, font(10, True, PURPLE))
    ws.merge_cells("G7:M7")
    put(ws, "G11", "Recurring — price per visit", GREEN_T, font(10, True, GREEN))
    ws.merge_cells("G11:M11")
    panel = [(8, "Initial Deep Clean", "F", PURPLE_T), (9, "Deluxe Deep Clean", "G", PURPLE_T),
             (10, "Move-In / Move-Out", "H", PURPLE_T), (12, "Weekly", "E", GREEN_T),
             (13, "Every 2 weeks", "D", GREEN_T), (14, "Monthly", "C", GREEN_T)]
    dv_yn = DataValidation(type="list", formula1='"Yes,No"', allow_blank=False)
    ws.add_data_validation(dv_yn)
    dv_price = DataValidation(type="decimal", operator="between", formula1="0", formula2="20000", allow_blank=True,
                              showErrorMessage=True, errorTitle="Check this entry", error="Type a dollar amount.",
                              prompt="Optional. Blank = Recommended. Type the price you'll quote.",
                              showInputMessage=True)
    ws.add_data_validation(dv_price)
    ok = b("ok")
    for rr, label, c, tint in panel:
        color = PURPLE if tint == PURPLE_T else GREEN
        promo = f"{BD}!{c}{CALC['promo']}"
        put(ws, f"G{rr}", f'="{label}"&IF(AND({ok},{BD}!{c}{CALC["minflag"]}="Yes"),"  (minimum)","")',
            None, font(11, True))
        put(ws, f"H{rr}", f'=IF({ok},{BD}!{c}{CALC["low"]}+{promo},"—")', None, font(10, color=SLATE), MONEY,
            align=RIGHT)
        put(ws, f"I{rr}", f'=IF({ok},{BD}!{c}{CALC["svc"]}+{promo},"—")', WHITE, font(14, True, color), MONEY,
            align=RIGHT)
        put(ws, f"J{rr}", f'=IF({ok},{BD}!{c}{CALC["high"]}+{promo},"—")', None, font(10, color=SLATE), MONEY,
            align=RIGHT)
        put(ws, f"K{rr}", None, ANSWER, font(12, True), MONEY, border=ANSWER_BOX, align=RIGHT)
        dv_price.add(f"K{rr}")
        put(ws, f"L{rr}", f'=IF({ok},{BD}!{c}{CALC["onsite"]},"—")', None, font(10), '0.0" hrs"', align=RIGHT)
        put(ws, f"M{rr}", "Yes", ANSWER, font(10, True), border=ANSWER_BOX, align=CENTER)
        dv_yn.add(f"M{rr}")
        ws.row_dimensions[rr].height = 24
        PRICE_ROWS[rr] = c
    put(ws, "G15", "Add-ons (added per visit)", GOLD_T, font(10, True))
    put(ws, "H15", None, GOLD_T)
    put(ws, "I15", f'=IF({ok},{b("addons_total")},"—")', GOLD_T, font(12, True), MONEY, align=RIGHT)
    for col in "JKLM":
        put(ws, f"{col}15", None, GOLD_T)
    ws.merge_cells("G16:M16")
    put(ws, "G16", f'="Low = "&TEXT({ref["range_low_pct"]},"0%")&" below, High = "&TEXT({ref["range_high_pct"]},"0%")'
                   f'&" above Recommended (change on Settings). Type your price in the yellow box after looking at '
                   f'the photos; blank = Recommended. The quote uses your price. Time on site = team of "'
                   f'&{ref["team_size"]}&". Initial Deep includes the promo."', border=None,
        f=font(8, italic=True, color=SLATE), align=WRAP)
    ws.row_dimensions[16].height = 34

    # ---- quote text
    band(ws, "G18:M18", "COPY INTO JOBBER — quote message", PURPLE, 11, 22)
    ws["G18"].value = "COPY INTO JOBBER  ·  quote message (click the box, copy)"
    NL = "CHAR(10)"

    def money(cell):
        return f'TEXT({cell},"$#,##0")'

    def final(r):  # the team's price if typed, else Recommended
        return f'IF(K{r}<>"",K{r},I{r})'

    one_time = (f'IF(OR(M8="Yes",M9="Yes",M10="Yes"),"ONE-TIME CLEANS"&{NL}'
                f'&IF(M8="Yes","• Initial Deep Clean: "&{money(final(8))}&IF({b("promo")}>0," (includes $"&{b("promo")}&" off promo)","")&{NL},"")'
                f'&IF(M9="Yes","• Deluxe Deep Clean: "&{money(final(9))}&{NL},"")'
                f'&IF(M10="Yes","• Move-In / Move-Out Clean: "&{money(final(10))}&{NL},"")&{NL},"")')
    recurring = (f'IF(OR(M12="Yes",M13="Yes",M14="Yes"),"RECURRING MAINTENANCE (per visit, after an initial deep clean)"&{NL}'
                 f'&IF(M12="Yes","• Weekly: "&{money(final(12))}&{NL},"")'
                 f'&IF(M13="Yes","• Every 2 weeks: "&{money(final(13))}&{NL},"")'
                 f'&IF(M14="Yes","• Monthly: "&{money(final(14))}&{NL},"")&{NL},"")')
    a = ADDON
    addons = (f'IF({a["total"]}>0,"ADD-ONS (per visit)"&{NL}'
              f'&IF({a["fridge"]}>0,"• Inside refrigerator: "&{money(a["fridge"])}&{NL},"")'
              f'&IF({a["oven"]}>0,"• Inside oven: "&{money(a["oven"])}&{NL},"")'
              f'&IF({a["windows"]}>0,"• Interior windows ("&{b("windows")}&"): "&{money(a["windows"])}&{NL},"")&{NL},"")')
    body = (f'"Hi "&{b("first_name")}&","&{NL}&{NL}&"Thanks for reaching out to Lemon and Lavender Cleaning Co.! '
            f'Based on your "&TEXT({b("sqft")},"#,##0")&" sq ft home"'
            f'&IF(AND({b("beds")}<>"",{b("baths")}<>"")," ("&{b("beds")}&" bed / "&{b("baths")}&" bath)","")'
            f'&IF({b("street")}<>""," at "&{b("street")},"")&", here are your estimated prices:"&{NL}&{NL}'
            f'&{one_time}&{recurring}&{addons}&{ref["closing"]}')
    decline = f'"Hi "&{b("first_name")}&","&{NL}&{NL}&{ref["decline"]}'
    ws.merge_cells("G19:M36")
    put(ws, "G19", f'=IF({b("dnr")},{decline},IF(NOT({ok}),"The quote message appears here once the status bar is '
                   f'green.",{body}))', WHITE, font(10), align=WRAP_TOP,
        border=Border(left=med, right=med, top=med, bottom=med))

    # ---- Jobber line items
    band(ws, "G38:M38", "JOBBER LINE ITEMS  ·  add as optional items so the client picks", PURPLE, 10, 20)
    for col, t in zip("GHM", ["Line item", "Description", "Price"]):
        put(ws, f"{col}39", t, PURPLE_T, font(9, True, SLATE), align=CENTER)
    ws.merge_cells("H39:L39")
    lines = [(40, 8, "Initial Deep Clean", "F"), (41, 9, "Deluxe Deep Clean", "G"),
             (42, 10, "Move-In / Move-Out Clean", "H"), (43, 12, "Weekly Maintenance Clean", "E"),
             (44, 13, "Bi-Weekly Maintenance Clean", "D"), (45, 14, "Monthly Maintenance Clean", "C")]
    for rr, pr, name, c in lines:
        cond = f'AND({ok},M{pr}="Yes")'
        # line price before promo, so "line - promo line" = the price quoted
        before_promo = f"{final(pr)}-{BD}!{c}{CALC['promo']}"
        put(ws, f"G{rr}", f'=IF({cond},"{name}","")', f=font(10))
        ws.merge_cells(f"H{rr}:L{rr}")
        put(ws, f"H{rr}", f'=IF({cond},{svc(ref, "desc", c)},"")', f=font(8), align=WRAP)
        put(ws, f"M{rr}", f'=IF({cond},{before_promo},"")', f=font(10, True), fmt=MONEY)
        ws.row_dimensions[rr].height = 26
    extra = [(46, f'{a["fridge"]}>0', "Inside Refrigerator", '"Interior refrigerator cleaning"', a["fridge"]),
             (47, f'{a["oven"]}>0', "Inside Oven", '"Interior oven cleaning"', a["oven"]),
             (48, f'{a["windows"]}>0', "Interior Windows", f'{b("windows")}&" interior windows"', a["windows"]),
             (49, f'AND(M8="Yes",{b("promo")}>0)', "Promo discount", '"Initial Deep Clean promotion"',
              f'-{b("promo")}')]
    for rr, cond, name, desc, price in extra:
        cond = f"AND({ok},{cond})"
        put(ws, f"G{rr}", f'=IF({cond},"{name}","")', f=font(10))
        ws.merge_cells(f"H{rr}:L{rr}")
        put(ws, f"H{rr}", f'=IF({cond},{desc},"")', f=font(8), align=WRAP)
        put(ws, f"M{rr}", f'=IF({cond},{price},"")', f=font(10, True), fmt=MONEY)

    # ---- validation
    def dv(kind, cells, op=None, f1=None, f2=None, prompt=None, err=None):
        v = DataValidation(type=kind, operator=op, formula1=f1, formula2=f2, allow_blank=True,
                           showErrorMessage=True, error=err, errorTitle="Check this entry",
                           prompt=prompt, showInputMessage=bool(prompt))
        ws.add_data_validation(v)
        v.add(cells)

    dv("list", Q["pick"], f1="Requests!$E$2:$E$2000")
    dv("decimal", Q["sqft"], "between", "300", "10000", err="Square feet must be 300–10,000.")
    dv("whole", Q["beds"], "between", "0", "15", err="Bedrooms: a whole number 0–15.")
    dv("decimal", Q["baths"], "between", "0", "15", err="Bathrooms: 0–15 (0.5 for a half bath).")
    dv("whole", Q["people"], "between", "1", "20", err="People: a whole number 1–20.")
    dv("whole", f'{Q["dogs"]}:{Q["other"]}', "between", "0", "20", err="Animals: a whole number 0–20.")
    dv("whole", Q["dirt"], "between", "1", "11", prompt="1 cleanest · 5 average · 10 heavy · 11 we don't service",
       err="Dirt code must be a whole number 1–11.")
    dv("whole", Q["photo_dirt"], "between", "1", "11", err="Dirt code must be a whole number 1–11.")
    dv("decimal", Q["photo_pct"], "between", "-0.5", "0.5", err="Type a % between -50% and 50%.")
    dv("list", f'{Q["fridge"]}:{Q["oven"]}', f1='"Yes,No"')
    dv("whole", Q["windows"], "between", "0", "200", err="Windows: a whole number 0–200.")
    dv("decimal", Q["promo"], "between", "0", "1000", err="Promo: $0–$1,000.")
    ws.freeze_panes = "A4"


def parse_formulas() -> dict:
    """Formulas that read 'Label: value' pairs out of the request's Details text."""
    T = BD_REF["notes"]

    def parse(key):
        k = f'"{key}"'
        start = f"SEARCH({k},{T})"
        end = (f'MIN(IFERROR(SEARCH("|",{T},{start}),LEN({T})+1),'
               f"IFERROR(SEARCH(CHAR(10),{T},{start}),LEN({T})+1))")
        return f'IFERROR(TRIM(MID({T},{start}+LEN({k}),{end}-{start}-LEN({k}))),"")'

    def num(key):
        return f'=IFERROR(VALUE(SUBSTITUTE(SUBSTITUTE(LOWER({parse(key)}),"sq ft",""),",","")),"")'

    return {
        "sqft": num("Square footage:"), "beds": num("Bedrooms:"), "baths": num("Bathrooms:"),
        "people": num("People in home:"), "dogs": num("Dogs:"), "cats": num("Cats:"),
        "other": num("Other animals:"),
        "last_clean": f'=IFERROR(DATEVALUE({parse("Last professional cleaning:")}),"")',
        "service": (f'=IF({parse("Cleaning frequency:")}<>"",{parse("Cleaning frequency:")},'
                    f'{parse("Service requested:")})'),
        "promo": (f'=IFERROR(VALUE(MID({T},SEARCH("Offer: $",{T})+8,'
                  f'SEARCH(" off",{T},SEARCH("Offer: $",{T}))-SEARCH("Offer: $",{T})-8)),"")'),
    }


# ================================================================ BREAKDOWN
BD_REF: dict = {}   # name -> 'Breakdown!$C$n'
CALC: dict = {}     # calc step -> row number on Breakdown
ADDON: dict = {}    # add-on -> price cell


def plan_breakdown():
    """Fix every Breakdown row number up front so Quote formulas can reference them."""
    used = ["client", "street", "city", "sqft", "beds", "baths", "people", "dogs", "cats", "other",
            "last_clean", "dirt_entered", "photo_dirt", "dirt_used", "photo_pct", "photo_why", "photos",
            "fridge", "oven", "windows", "promo"]
    behind = ["row_found", "notes", "errors", "dnr", "ok", "warnings", "months", "extra_baths", "occ_add",
              "pet_add", "dirt_mult", "last_factor", "photo_factor", "first_name", "addons_total"]
    r = 5
    for n in used:
        BD_REF[n] = f"{BD}!$C${r}"
        r += 1
    USED_ROWS[:] = used
    r += 2  # gap + calc band
    calc_first = r + 1  # header row = r, first step = r+1
    steps = ["rate", "base", "bath", "scope", "dirt", "occ", "pet", "last", "hours", "onsite", "brate", "labor",
             "photo", "round", "min", "svc", "minflag", "low", "high", "promo", "addons", "total", "freq", "eff", "card", "diff"]
    CALC_HEADER[0] = r
    for i, s in enumerate(steps):
        CALC[s] = calc_first + i
    r = calc_first + len(steps) + 1
    ADDON_HEADER[0] = r
    for i, k in enumerate(["fridge", "oven", "windows"]):
        ADDON[k] = f"{BD}!$D${r + 2 + i}"
    ADDON["total"] = f"{BD}!$D${r + 5}"
    r += 7
    BEHIND_HEADER[0] = r
    for i, n in enumerate(behind):
        BD_REF[n] = f"{BD}!$C${r + 1 + i}"
    BEHIND_ROWS[:] = behind


USED_ROWS: list = []
BEHIND_ROWS: list = []
CALC_HEADER = [0]
ADDON_HEADER = [0]
BEHIND_HEADER = [0]


def build_breakdown(wb, ref: Ref):
    ws = wb.create_sheet(BD)
    ws.sheet_view.showGridLines = False
    for k, v in {"A": 2, "B": 44, "C": 15, "D": 15, "E": 15, "F": 15, "G": 15, "H": 15, "I": 40}.items():
        ws.column_dimensions[k].width = v
    ws.merge_cells("B1:I1")
    put(ws, "B1", "BREAKDOWN — how every price was worked out (read-only)", SLATE, font(14, True, WHITE),
        border=None, align=Alignment(vertical="center", indent=1))
    ws.row_dimensions[1].height = 28
    ws.merge_cells("B2:I2")
    put(ws, "B2", "Nothing to type here. To change a number, use the Settings tab.", border=None,
        f=font(10, italic=True, color=SLATE))

    def qa(name, default_expr=None):
        """Your answer if typed, else the request value, else a default."""
        c, d = Q[name], Q[name + "_auto"]
        if MANUAL_FIELDS.get(name):
            return f'=IF(Quote!{c}<>"",Quote!{c},{default_expr if default_expr is not None else chr(34)*2})'
        tail = default_expr if default_expr is not None else f"Quote!{d}"
        if default_expr is not None:
            tail = f'IF(Quote!{d}<>"",Quote!{d},{default_expr})'
        return f'=IF(Quote!{c}<>"",Quote!{c},{tail})'

    used = {
        "client": ("Client", qa("client"), None),
        "street": ("Street", qa("street"), None),
        "city": ("City", qa("city"), None),
        "sqft": ("Square feet", qa("sqft"), "#,##0"),
        "beds": ("Bedrooms", qa("beds"), "0"),
        "baths": ("Bathrooms", qa("baths"), "0.0"),
        "people": ("People", qa("people", ref["occupants_included"]), "0"),
        "dogs": ("Dogs", qa("dogs", "0"), "0"),
        "cats": ("Cats", qa("cats", "0"), "0"),
        "other": ("Other animals", qa("other", "0"), "0"),
        "last_clean": ("Last professional cleaning (blank or 'never' = unknown)",
                       f'=IF(ISNUMBER(Quote!{Q["last_clean"]}),Quote!{Q["last_clean"]},"")', "mm/dd/yyyy"),
        "dirt_entered": ("Dirt code entered", f'=Quote!{Q["dirt"]}', "0"),
        "photo_dirt": ("New dirt code after photos", f'=Quote!{Q["photo_dirt"]}&""', None),
        "dirt_used": ("Dirt code used", f'=IF(Quote!{Q["photo_dirt"]}<>"",Quote!{Q["photo_dirt"]},IF(Quote!{Q["dirt"]}<>"",Quote!{Q["dirt"]},""))', "0"),
        "photo_pct": ("Price change after photos", f'=N(Quote!{Q["photo_pct"]})', PCT),
        "photo_why": ("Why", f'=Quote!{Q["photo_why"]}&""', None),
        "photos": ("Photo links", f'=TRIM(Quote!{Q["photos"]}&" "&Quote!{Q["photos_auto"]})', None),
        "fridge": ("Inside refrigerator", f'=IF(Quote!{Q["fridge"]}="Yes","Yes","No")', None),
        "oven": ("Inside oven", f'=IF(Quote!{Q["oven"]}="Yes","Yes","No")', None),
        "windows": ("Interior windows", f'=N(Quote!{Q["windows"]})', "0"),
        "promo": ("Promo $ off Initial Deep", qa("promo", "0"), MONEY),
    }
    band(ws, "B4:C4", "WHAT THE PRICE USES", BLUE, 11, 20)
    for n in USED_ROWS:
        label, formula, fmt = used[n]
        rr = int(BD_REF[n].split("$")[-1])
        put(ws, f"B{rr}", label, BLUE_T)
        put(ws, f"C{rr}", formula, AUTO, font(10, True), fmt, align=CENTER)

    def u(n):
        return BD_REF[n]

    # ---- calculation table
    h = CALC_HEADER[0]
    band(ws, f"B{h-1}:H{h-1}", "STEP BY STEP, FOR EACH SERVICE", PURPLE, 11, 20)
    put(ws, f"B{h}", "Step", PURPLE_T, font(bold=True))
    for col, name in zip(SVC_COLS, SVC_NAMES):
        put(ws, f"{col}{h}", name, PURPLE_T, font(bold=True), align=CENTER)
    st = ref.cell
    R = CALC
    calc = [
        ("rate", "Cleaning speed (sq ft per labor hour)", lambda c: f"={svc(ref, 'production_rate', c)}", "#,##0"),
        ("base", "Base hours = sq ft ÷ speed", lambda c: f"=IFERROR({u('sqft')}/{c}{R['rate']},0)", HRS),
        ("bath", "+ Extra bathroom hours", lambda c: f"={u('extra_baths')}*{svc(ref, 'extra_bath_hours', c)}", HRS),
        ("scope", "× Time multiplier (Deluxe)", lambda c: f"={svc(ref, 'scope_multiplier', c)}", "0.00"),
        ("dirt", "× Dirt code", lambda c: f"=1+({u('dirt_mult')}-1)*{svc(ref, 'dirt_sensitivity', c)}", "0.000"),
        ("occ", "× People", lambda c: f"=1+{svc(ref, 'household_factors_apply', c)}*{u('occ_add')}", "0.000"),
        ("pet", "× Pets", lambda c: f"=1+{svc(ref, 'household_factors_apply', c)}*{u('pet_add')}", "0.000"),
        ("last", "× Time since last clean",
         lambda c: f"=IF({svc(ref, 'last_clean_applies', c)}=1,{u('last_factor')},1)", "0.000"),
        ("hours", "→ Labor hours (rounded up)",
         lambda c: (f"=CEILING(({c}{R['base']}+{c}{R['bath']})*{c}{R['scope']}*{c}{R['dirt']}*{c}{R['occ']}"
                    f"*{c}{R['pet']}*{c}{R['last']},{st['hours_rounding']})"), HRS),
        ("onsite", "Time on site for the team", lambda c: f"={c}{R['hours']}/{st['team_size']}", HRS),
        ("brate", "× Hourly rate", lambda c: f"={svc(ref, 'billable_rate', c)}", MONEY),
        ("labor", "→ Labor price", lambda c: f"={c}{R['hours']}*{c}{R['brate']}", MONEY2),
        ("photo", "× Photo price change", lambda c: f"={c}{R['labor']}*{u('photo_factor')}", MONEY2),
        ("round", "Rounded up to nearest $5",
         lambda c: f"=CEILING(MAX(0,{c}{R['photo']}),{st['price_rounding']})", MONEY),
        ("min", "Minimum for this service",
         lambda c: (f"=MAX({svc(ref, 'minimum_price', c)},IF({svc(ref, 'one_time', c)}=1,"
                    f"{st['trip_minimum_one_time']},0))"), MONEY),
        ("svc", "→ Service price (the higher of the two)", lambda c: f"=MAX({c}{R['round']},{c}{R['min']})", MONEY),
        ("minflag", "Minimum used?", lambda c: f'=IF({c}{R["min"]}>{c}{R["round"]},"Yes","No")', None),
        ("low", "Low end of range (never below the minimum)",
         lambda c: (f"=MAX({c}{R['min']},FLOOR({c}{R['svc']}*(1-{st['range_low_pct']}),{st['price_rounding']}))"),
         MONEY),
        ("high", "High end of range",
         lambda c: f"=CEILING({c}{R['svc']}*(1+{st['range_high_pct']}),{st['price_rounding']})", MONEY),
        ("promo", "− Promo (Initial Deep only)", lambda c: f"=-{u('promo')}" if c == "F" else "=0", MONEY),
        ("addons", "+ Add-ons (per visit)", lambda c: f"={ADDON['total']}", MONEY),
        ("total", "TOTAL with add-ons", lambda c: f'=IF({u("ok")},{c}{R["svc"]}+{c}{R["promo"]}+{c}{R["addons"]},"—")',
         MONEY),
        ("freq", "Visit time vs. Monthly (how frequency changes price)",
         lambda c: f"={svc(ref, 'production_rate', 'C')}/{c}{R['rate']}" if c in "CDE" else '="—"', PCT),
        ("eff", "Effective $ per labor hour",
         lambda c: f'=IF(AND({u("ok")},{c}{R["hours"]}>0),{c}{R["svc"]}/{c}{R["hours"]},"—")', MONEY2),
        ("card", "Rate card midpoint at $85 (reference)", None, MONEY),
        ("diff", "This price vs. rate card",
         lambda c: f'=IF(AND({u("ok")},ISNUMBER({c}{R["card"]})),{c}{R["svc"]}-{c}{R["card"]},"—")', MONEY),
    ]
    card_col = {"C": "E", "D": "G", "E": "I", "F": "K", "G": None, "H": "M"}
    for key, label, fn, fmt in calc:
        rr = R[key]
        strong = key in ("hours", "svc", "total")
        put(ws, f"B{rr}", label, PURPLE_T if strong else None, font(10, strong))
        for c in SVC_COLS:
            if key == "card":
                cc = card_col[c]
                f = ('="n/a"' if cc is None else
                     f'=IFERROR(IF({u("sqft")}>{st["walkthrough_sqft"]},"Custom",'
                     f"LOOKUP({u('sqft')},'Rate Card'!$A$6:$A$12,'Rate Card'!${cc}$6:${cc}$12)),\"—\")")
            else:
                f = fn(c)
            put(ws, f"{c}{rr}", f, PURPLE_T if strong else AUTO, font(10, strong), fmt, align=RIGHT)

    # ---- add-ons
    h = ADDON_HEADER[0]
    band(ws, f"B{h}:D{h}", "ADD-ONS", GOLD, 11, 20)
    for col, t in zip("BCD", ["Add-on", "Hours", "Price"]):
        put(ws, f"{col}{h+1}", t, GOLD_T, font(bold=True))
    for i, (k, label, hf) in enumerate([
        ("fridge", "Inside refrigerator", f'=IF({u("fridge")}="Yes",{st["fridge_hours"]},0)'),
        ("oven", "Inside oven", f'=IF({u("oven")}="Yes",{st["oven_hours"]},0)'),
        ("windows", "Interior windows", f"={u('windows')}*{st['window_hours_each']}"),
    ]):
        rr = h + 2 + i
        put(ws, f"B{rr}", label)
        put(ws, f"C{rr}", hf, AUTO, fmt=HRS)
        put(ws, f"D{rr}", f"=CEILING(C{rr}*{st['addon_rate']},{st['price_rounding']})", AUTO, fmt=MONEY)
    put(ws, f"B{h+5}", "Add-ons total", GOLD_T, font(bold=True))
    put(ws, f"D{h+5}", f"=SUM(D{h+2}:D{h+4})", GOLD_T, font(bold=True), MONEY)

    # ---- behind the scenes
    h = BEHIND_HEADER[0]
    band(ws, f"B{h}:I{h}", "BEHIND THE SCENES (checks and lookups)", SLATE, 11, 20)
    T = u("notes")
    behind = {
        "row_found": ("Requests row loaded",
                      f'=IF(Quote!{Q["pick"]}="","",IFERROR(MATCH(Quote!{Q["pick"]},Requests!$E:$E,0),""))', None),
        "notes": ("Request details text", f'=IF({u("row_found")}="","",INDEX(Requests!$M:$M,{u("row_found")})&"")', None),
        "errors": ("Problems that block the quote",
                   f'=IF({u("sqft")}="","Square feet is required. ",IF(NOT(ISNUMBER({u("sqft")})),"Square feet must be a number. ",'
                   f'IF(OR({u("sqft")}<{st["min_sqft"]},{u("sqft")}>{st["max_sqft"]}),"Square feet must be "&TEXT({st["min_sqft"]},"#,##0")'
                   f'&"–"&TEXT({st["max_sqft"]},"#,##0")&". ","")))'
                   f'&IF({u("dirt_used")}="","Dirt code is required. ",IF(NOT(ISNUMBER({u("dirt_used")})),"Dirt code must be a whole number 1–11. ",'
                   f'IF(OR({u("dirt_used")}<1,{u("dirt_used")}>11,{u("dirt_used")}<>INT({u("dirt_used")})),"Dirt code must be a whole number 1–11. ","")))'
                   f'&IF(OR(N({u("people")})<1,N({u("dogs")})<0,N({u("cats")})<0,N({u("other")})<0),'
                   f'"People and animal counts can\'t be negative (at least 1 person). ","")', None),
        "dnr": ("Do not service (dirt code 11)?", f'=AND(ISNUMBER({u("dirt_used")}),{u("dirt_used")}=11)', None),
        "ok": ("OK to price?", f'=AND({u("errors")}="",NOT({u("dnr")}))', None),
        "warnings": ("Warnings",
                     f'=IF(AND(ISNUMBER({u("sqft")}),{u("sqft")}>{st["walkthrough_sqft"]}),"Over "&TEXT({st["walkthrough_sqft"]},"#,##0")'
                     f'&" sq ft — walk-through required before the final price. ","")'
                     f'&IF(AND({u("city")}<>"",ISNA(MATCH({u("city")},{st["area"]},0))),"City is outside the service area — confirm before quoting. ","")'
                     f'&IF(AND(OR(Quote!{Q["photo_dirt"]}<>"",N(Quote!{Q["photo_pct"]})<>0),Quote!{Q["photo_why"]}=""),"Photos changed the price — add the reason. ","")'
                     f'&IF(OR({u("beds")}="",{u("baths")}=""),"Bedrooms or bathrooms missing. ","")'
                     f'&IF(AND({u("ok")},OR({",".join(f"AND(Quote!K{r}<>{chr(34)*2},OR(Quote!K{r}<Quote!H{r},Quote!K{r}>Quote!J{r}))" for r in (8, 9, 10, 12, 13, 14))})),'
                     f'"A price you typed is outside the suggested range — double-check it. ","")', None),
        "months": ("Months since last professional clean",
                   f'=IF({u("last_clean")}="",{st["months_if_unknown"]},MAX(0,(TODAY()-{u("last_clean")})/30.4375))', "0.0"),
        "extra_baths": ("Extra bathrooms (beyond 1 per 750 sq ft)",
                        f"=IF(ISNUMBER({u('sqft')}),MAX(0,N({u('baths')})-{u('sqft')}/{st['sqft_per_included_bath']}),0)", "0.00"),
        "occ_add": ("Extra time for people",
                    f"=MIN({st['occupant_cap']},MAX(0,N({u('people')})-{st['occupants_included']})*{st['per_extra_occupant']})", PCT),
        "pet_add": ("Extra time for pets",
                    f"=MIN({st['pet_cap']},N({u('dogs')})*{st['per_dog']}+N({u('cats')})*{st['per_cat']}"
                    f"+N({u('other')})*{st['per_other_animal']})", PCT),
        "dirt_mult": ("Dirt code time ×", f"=IFERROR(VLOOKUP({u('dirt_used')},{st['dirt_table']},2,FALSE)*1,1)", "0.00"),
        "last_factor": ("Last clean time ×", f"=LOOKUP({u('months')},{st['bands_m']},{st['bands_f']})", "0.00"),
        "photo_factor": ("Photo price ×", f"=1+{u('photo_pct')}", "0.00"),
        "first_name": ("Client first name (for the greeting)",
                       f'=IF({u("client")}="","there",LEFT({u("client")},FIND(" ",{u("client")}&" ")-1))', None),
        "addons_total": ("Add-ons total", f"={ADDON['total']}", MONEY),
    }
    for n in BEHIND_ROWS:
        label, formula, fmt = behind[n]
        rr = int(BD_REF[n].split("$")[-1])
        put(ws, f"B{rr}", label, SLATE_T)
        ws.merge_cells(f"C{rr}:I{rr}")
        put(ws, f"C{rr}", formula, AUTO, font(10), fmt, align=Alignment(horizontal="left", wrap_text=True))
    ws.freeze_panes = "C3"


# ================================================================ HOW TO
def build_howto(wb):
    ws = wb.create_sheet("How To Use")
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 2
    ws.column_dimensions["B"].width = 6
    ws.column_dimensions["C"].width = 110
    ws.merge_cells("B1:C1")
    put(ws, "B1", "HOW TO PRICE A REQUEST", PURPLE, font(16, True, WHITE), border=None,
        align=Alignment(vertical="center", indent=1))
    ws.row_dimensions[1].height = 30
    steps = [
        (PURPLE, "①", "Go to the Quote tab. Pick the client in the yellow box at the top (step ①). "
         "Phone call? Leave it blank and type the details yourself."),
        (BLUE, "②", "Check THE HOME. Grey = what the request said. ORANGE boxes (people, pets, last cleaning) "
         "never come through from Jobber: open the Jobber request and type them in. Yellow = only to add or fix."),
        (ORANGE, "③", "Look at the photos in Jobber and enter the dirt code (1–11) in the orange box. "
         "If the photos change your mind, fill in the Photo check rows and say why."),
        (GREEN, "④", "Type the add-ons from the Jobber request (orange). The promo fills in by itself for Meta ads."),
        (SLATE, "✅", "The bar at the top must be GREEN, and the orange to-do bar must say all filled in. Red = dirt "
         "code 11: we don't service it, copy the decline message instead. Amber = something's missing."),
        (PURPLE, "💲", "Each service shows Low · Recommended · High. Use your judgment: type the price you'll quote "
         "in the yellow 'Your price' box (blank = Recommended). Stay inside the range unless you have a reason."),
        (PURPLE, "📋", "Set 'Put in quote?' to No for services the client doesn't want. Copy the quote message into "
         "Jobber and add the line items. Both use your price."),
        (GOLD, "📝", "On the Requests tab, fill in the yellow columns: Status, Service Quoted, Price Quoted, Quoted By, Date."),
        (SLATE, "🧹", "Before the next quote, delete what you typed in the orange and yellow boxes."),
    ]
    r = 3
    for color, icon, text in steps:
        put(ws, f"B{r}", icon, color, font(14, True, WHITE), border=None, align=CENTER)
        put(ws, f"C{r}", text, None, font(11), border=None, align=WRAP)
        ws.row_dimensions[r].height = 36
        r += 1
    r += 1
    for t, f in [("DIRT CODE", font(12, True, ORANGE)),
                 ("1 = cleanest home you've ever seen · 5 = average · 10 = heavy buildup, debris, grime, clutter · "
                  "11 = WE DO NOT SERVICE (biohazard / hoarding)", font(11)),
                 ("", None),
                 ("GOOD TO KNOW", font(12, True, PURPLE)),
                 ("Only Andrew changes the Settings tab. Never type over grey cells.", font(11)),
                 ("Want to see the math? The Breakdown tab shows every step for every service.", font(11)),
                 ("Two people quoting at once? One of you right-clicks the Quote tab ▸ Duplicate and works in the copy.",
                  font(11))]:
        ws.merge_cells(f"B{r}:C{r}")
        put(ws, f"B{r}", t, border=None, f=f, align=WRAP)
        r += 1


# ================================================================ BUILD
def build(path: Path = OUT, answers: dict | None = None) -> None:
    """answers = {"sqft": 2000, "pick": None, ...} overrides Quote answer cells (for tests)."""
    Q.clear()
    MANUAL_FIELDS.clear()
    PRICE_ROWS.clear()
    BD_REF.clear()
    CALC.clear()
    ADDON.clear()
    wb = Workbook()
    plan_breakdown()
    ref = build_settings(wb)
    build_requests(wb)
    wb.active = 0
    build_quote(wb, ref)
    build_breakdown(wb, ref)
    build_rate_card(wb)
    build_howto(wb)
    wb._sheets = [wb[n] for n in ["Quote", "Requests", "Breakdown", "Settings", "Rate Card", "How To Use"]]
    tab_colors = {"Quote": PURPLE, "Requests": GOLD, "Breakdown": SLATE, "Settings": BLUE,
                  "Rate Card": GREEN, "How To Use": ORANGE}
    for name, color in tab_colors.items():
        wb[name].sheet_properties.tabColor = color
    wb.active = 0
    ws = wb["Quote"]
    for name, v in (answers or {}).items():
        ws[Q.get(name, name)] = v  # a field name, or a raw cell like "K12"
    wb.save(path)


if __name__ == "__main__":
    build()
    print(f"Wrote {OUT}")
