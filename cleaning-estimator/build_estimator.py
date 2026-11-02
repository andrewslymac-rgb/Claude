"""Build the Lemon and Lavender Cleaning Co. estimator workbook (.xlsx).

    python3 cleaning-estimator/build_estimator.py            # -> LL_Residential_Estimator.xlsx

Upload the .xlsx to Google Drive and open it as a Google Sheet (see README).
Every number the pricing uses lives on the Settings tab; the formulas here
only reference Settings cells. pricing.py is the same logic in Python.
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

# ---------------------------------------------------------------- styles
LAV = "6B4E9B"          # lavender (headers)
LAV_LIGHT = "EEE8F6"
LEMON = "FFF6C2"        # input cells
GREY = "F2F2F2"         # auto / formula cells
BLUE = "DDEBF7"         # editable settings
WHITE = "FFFFFF"
thin = Side(style="thin", color="BFBFBF")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)


def fill(c):
    return PatternFill("solid", start_color=c, end_color=c)


H1 = Font(bold=True, size=16, color=LAV)
H2 = Font(bold=True, size=12, color=WHITE)
BOLD = Font(bold=True)
ITAL = Font(italic=True, color="595959")
WRAP = Alignment(wrap_text=True, vertical="top")
MONEY = '"$"#,##0'
MONEY2 = '"$"#,##0.00'
HRS = "0.00"
PCT = "0%"

SVC_COLS = ["C", "D", "E", "F", "G", "H"]  # Settings + calc columns, SERVICES order
SVC_NAMES = ["Monthly", "Bi-Weekly", "Weekly", "Initial Deep", "Deluxe Deep", "Move-In/Out"]


def section(ws, row, text, first="B", last="F"):
    ws[f"{first}{row}"] = text
    ws.merge_cells(f"{first}{row}:{last}{row}")
    c = ws[f"{first}{row}"]
    c.font = H2
    c.fill = fill(LAV)
    c.alignment = Alignment(vertical="center")
    ws.row_dimensions[row].height = 20


def style(ws, ref, f=None, font=None, fmt=None, border=True, align=None):
    c = ws[ref]
    if f:
        c.fill = fill(f)
    if font:
        c.font = font
    if fmt:
        c.number_format = fmt
    if border:
        c.border = BOX
    if align:
        c.alignment = align
    return c


# ================================================================ SETTINGS
def build_settings(wb):
    ws = wb.create_sheet("Settings")
    ref = {}
    ws["B1"] = "Settings — every rate, multiplier and time assumption"
    ws["B1"].font = H1
    ws["B2"] = ("Blue cells are editable. Change a number here and every estimate updates. "
                "Source column says where each default came from.")
    ws["B2"].font = ITAL
    widths = {"A": 2, "B": 44, "C": 13, "D": 13, "E": 13, "F": 13, "G": 13, "H": 15, "I": 60}
    for k, v in widths.items():
        ws.column_dimensions[k].width = v

    # --- per-service table
    section(ws, 4, "SERVICE PARAMETERS", "B", "I")
    ws["B5"] = "Setting"
    for col, name in zip(SVC_COLS, SVC_NAMES):
        ws[f"{col}5"] = name
    ws["I5"] = "Source / notes"
    for col in ["B"] + SVC_COLS + ["I"]:
        style(ws, f"{col}5", LAV_LIGHT, BOLD)
    rows = [
        ("production_rate", "Production rate (sq ft per labor hour)", "#,##0",
         "Rate card. Monthly 650 / Bi-weekly 775 / Weekly 850 / Deep 300 / Move 275. "
         "Frequency changes price through these rates."),
        ("scope_multiplier", "Scope hours multiplier", "0.00",
         "ASSUMPTION: Deluxe Deep = Initial Deep x 1.25 (baseboards, blinds, inside cabinets, door frames)."),
        ("billable_rate", "Billable rate ($ per labor hour)", MONEY,
         "Andrew Nov 2026: $80 recurring, $90 deep / deluxe / move (rate card still shows $85)."),
        ("minimum_price", "Minimum price per visit", MONEY,
         "Rate card methodology list. Card also shows $325 Deluxe / $400 Move in its tables — conflict emailed."),
        ("extra_bath_hours", "Hours per extra bathroom", "0.00",
         "ASSUMPTION: bathrooms beyond 1 per 750 sq ft add this much time."),
        ("dirt_sensitivity", "Dirt code sensitivity (0 = ignore, 1 = full)", "0.00",
         "ASSUMPTION: recurring visits feel half the dirt effect (home is reset by the initial deep)."),
        ("household_factors_apply", "People & pet factors apply? (1 yes / 0 no)", "0",
         "ASSUMPTION: Move-In/Out priced as an empty home."),
        ("last_clean_applies", "Time-since-last-clean factor applies? (1/0)", "0",
         "ASSUMPTION: only one-time cleans; recurring homes are maintained by us."),
        ("one_time", "One-time service? (1/0) — gets trip minimum", "0", "Used for the $250 one-time trip minimum."),
    ]
    r = 6
    for key, label, fmt, note in rows:
        ws[f"B{r}"] = label
        style(ws, f"B{r}")
        for i, col in enumerate(SVC_COLS):
            ws[f"{col}{r}"] = S[key][i]
            style(ws, f"{col}{r}", BLUE, fmt=fmt)
        ws[f"I{r}"] = note
        style(ws, f"I{r}", font=ITAL, align=WRAP)
        ref[key] = r
        r += 1
    # Quote line descriptions
    ws[f"B{r}"] = "Quote line description (Jobber)"
    style(ws, f"B{r}")
    descs = [
        "Recurring maintenance clean, once a month",
        "Recurring maintenance clean, every 2 weeks",
        "Recurring maintenance clean, every week",
        "Full top-to-bottom reset clean; first visit before recurring service",
        "Initial deep clean plus baseboards, blinds, inside cabinets and door frames",
        "Top-to-bottom clean of an empty or nearly empty home",
    ]
    for col, d in zip(SVC_COLS, descs):
        ws[f"{col}{r}"] = d
        style(ws, f"{col}{r}", BLUE, align=WRAP)
    ws.row_dimensions[r].height = 60
    ws[f"I{r}"] = "Text used for the Jobber line items block on the Estimator."
    style(ws, f"I{r}", font=ITAL, align=WRAP)
    ref["desc"] = r

    # --- general settings
    r += 2
    section(ws, r, "GENERAL", "B", "I")
    r += 1
    general = [
        ("trip_minimum_one_time", "One-time job trip minimum", MONEY, "Rate card: minimum to go out for any one time."),
        ("hours_rounding", "Round labor hours UP to nearest", "0.00", "ASSUMPTION"),
        ("price_rounding", "Round price UP to nearest $", MONEY, "Rate card"),
        ("sqft_per_included_bath", "Sq ft per bathroom included in base time", "#,##0", "ASSUMPTION"),
        ("team_size", "Cleaners per team (for on-site time)", "0",
         "ASSUMPTION: rate card hours = total labor hours; on-site time = hours / team."),
        ("occupants_included", "People included in base price", "0", "ASSUMPTION; also the default when unknown."),
        ("per_extra_occupant", "Added time per extra person", PCT, "ASSUMPTION"),
        ("occupant_cap", "Max added time for people", PCT, "ASSUMPTION"),
        ("per_dog", "Added time per dog", PCT, "ASSUMPTION (rate card: use high end for pets)"),
        ("per_cat", "Added time per cat", PCT, "ASSUMPTION"),
        ("per_other_animal", "Added time per other animal", PCT, "ASSUMPTION"),
        ("pet_cap", "Max added time for pets", PCT, "ASSUMPTION"),
        ("walkthrough_sqft", "Walk-through required above (sq ft)", "#,##0", "Rate card: custom quote over 4,000."),
        ("min_sqft", "Smallest valid sq ft", "#,##0", "Input check"),
        ("max_sqft", "Largest valid sq ft", "#,##0", "Input check"),
        ("months_if_unknown", "Months since last pro clean if date blank", "0", "ASSUMPTION: blank = never / unknown."),
        ("addon_rate", "Add-on billable rate ($/hr)", MONEY, "ASSUMPTION: rate card add-on section is blank."),
        ("fridge_hours", "Inside refrigerator (hours)", "0.00", "ASSUMPTION"),
        ("oven_hours", "Inside oven (hours)", "0.00", "ASSUMPTION"),
        ("window_hours_each", "Interior windows (hours per window)", "0.00", "ASSUMPTION"),
    ]
    for key, label, fmt, note in general:
        ws[f"B{r}"] = label
        style(ws, f"B{r}")
        ws[f"C{r}"] = S[key]
        style(ws, f"C{r}", BLUE, fmt=fmt)
        ws[f"D{r}"] = note
        ws.merge_cells(f"D{r}:I{r}")
        ws[f"D{r}"].font = ITAL
        ref[key] = r
        r += 1

    # --- dirt table
    r += 1
    section(ws, r, "DIRT CODE → TIME MULTIPLIER", "B", "I")
    r += 1
    for col, t in zip("BCD", ["Dirt code", "Multiplier", "What it looks like"]):
        style(ws, f"{col}{r}", LAV_LIGHT, BOLD)
        ws[f"{col}{r}"] = t
    ws.merge_cells(f"D{r}:I{r}")
    r += 1
    looks = {1: "Cleanest home you've ever seen", 2: "Spotless, lightly lived in", 3: "Tidy, light dust",
             4: "Well kept, normal dust", 5: "Average lived-in home", 6: "Visible dust, some buildup in kitchen/baths",
             7: "Noticeable grime, pet hair, cluttered surfaces", 8: "Heavy buildup in kitchen/baths, clutter",
             9: "Very heavy buildup, grease, soap scum, clutter throughout",
             10: "Heaviest we'll take: buildup, debris, grime and clutter everywhere",
             11: "WE DO NOT SERVICE (biohazard, hoarding) — no estimate"}
    ref["dirt_first"] = r
    for code in range(1, 12):
        ws[f"B{r}"] = code
        style(ws, f"B{r}", align=Alignment(horizontal="center"))
        if code <= 10:
            ws[f"C{r}"] = S["dirt_multiplier"][code]
            style(ws, f"C{r}", BLUE, fmt="0.00")
        else:
            ws[f"C{r}"] = "n/a"
            style(ws, f"C{r}", GREY)
        ws[f"D{r}"] = looks[code]
        ws.merge_cells(f"D{r}:I{r}")
        r += 1
    ref["dirt_last"] = r - 1
    ws[f"B{r}"] = ("ASSUMPTION: code 5 = rate card formula. One-time cleans get the full multiplier; "
                   "recurring gets it scaled by 'Dirt code sensitivity'.")
    ws[f"B{r}"].font = ITAL
    r += 2

    # --- last clean bands
    section(ws, r, "TIME SINCE LAST PROFESSIONAL CLEAN → TIME MULTIPLIER", "B", "I")
    r += 1
    for col, t in zip("BC", ["At least (months)", "Multiplier"]):
        style(ws, f"{col}{r}", LAV_LIGHT, BOLD)
        ws[f"{col}{r}"] = t
    r += 1
    ref["band_first"] = r
    for months, factor in S["last_clean_bands"]:
        ws[f"B{r}"] = months
        style(ws, f"B{r}", BLUE, align=Alignment(horizontal="center"))
        ws[f"C{r}"] = factor
        style(ws, f"C{r}", BLUE, fmt="0.00")
        r += 1
    ref["band_last"] = r - 1
    ws[f"B{r}"] = "ASSUMPTION. Keep the months column in ascending order."
    ws[f"B{r}"].font = ITAL
    r += 2

    # --- service area
    section(ws, r, "SERVICE AREA (cities)", "B", "I")
    r += 1
    ref["area_first"] = r
    for i in range(12):
        ws[f"B{r}"] = S["service_area"][i] if i < len(S["service_area"]) else None
        style(ws, f"B{r}", BLUE)
        r += 1
    ref["area_last"] = r - 1
    ws[f"B{r}"] = "Add cities in the blank blue cells. Anything else gets an 'outside service area' warning."
    ws[f"B{r}"].font = ITAL
    r += 2

    # --- wording
    section(ws, r, "QUOTE WORDING", "B", "I")
    r += 1
    texts = [
        ("closing", "Quote closing paragraph",
         "These estimates are based on the details you shared. If the home's condition is noticeably "
         "different when we arrive, we'll talk with you before any change in price. Let us know which "
         "option works best and we'll get you on the schedule!"),
        ("decline", "Decline message (dirt code 11)",
         "Thank you for reaching out to Lemon and Lavender Cleaning Co. After reviewing the details of "
         "your home, we're not able to take on this cleaning. It falls outside the type of service our "
         "team is equipped to provide. We're sorry we can't help this time, and we appreciate you "
         "thinking of us."),
    ]
    for key, label, text in texts:
        ws[f"B{r}"] = label
        style(ws, f"B{r}", align=WRAP)
        ws[f"C{r}"] = text
        ws.merge_cells(f"C{r}:I{r}")
        style(ws, f"C{r}", BLUE, align=WRAP)
        ws.row_dimensions[r].height = 48
        ref[key] = r
        r += 1
    ws.freeze_panes = "C6"
    return ref


# ================================================================ REQUESTS
REQ_COLS = [
    ("Received", 18), ("Jobber Request ID", 16), ("Jobber Link", 30), ("Source", 12),
    ("Client Name", 22), ("Email", 24), ("Phone", 15), ("Street", 26), ("City", 14),
    ("State", 8), ("Zip", 8), ("Request Title", 28), ("Details (form answers / notes)", 60),
    ("Photo Links", 30),
    # manual columns
    ("Status", 16), ("Service Quoted", 20), ("Price Quoted", 12), ("Quoted By", 12),
    ("Date Quoted", 12), ("Team Notes", 30),
]


def build_requests(wb):
    ws = wb.create_sheet("Requests")
    for i, (name, w) in enumerate(REQ_COLS, start=1):
        col = get_column_letter(i)
        ws[f"{col}1"] = name
        ws.column_dimensions[col].width = w
        manual = i >= 15
        style(ws, f"{col}1", LEMON if manual else LAV_LIGHT, BOLD, align=WRAP)
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "A2"
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
    ws.row_dimensions[2].height = 60
    dv = DataValidation(type="list", allow_blank=True,
                        formula1='"New,Priced,Quote sent,Won,Lost,Declined (code 11),Out of area"')
    ws.add_data_validation(dv)
    dv.add("O2:O2000")
    ws["Q2"].number_format = MONEY
    return ws


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
    ws["A1"] = "Rate Card (reference only — copied from '1 NEW L&L Rate Card Residential ONLY')"
    ws["A1"].font = H1
    ws["A2"] = ("Card method: Hours = Sq Ft ÷ production rate; Price = Hours × $85, rounded up to $5, floored at the "
                "minimum. The Estimator uses the same method with the Settings tab rates. Midpoints are shown on "
                "the Estimator for comparison. Known inconsistencies were emailed to Andrew on 2026-11-02.")
    ws["A2"].alignment = WRAP
    ws.merge_cells("A2:M2")
    ws.row_dimensions[2].height = 45
    heads = ["Band min sq ft", "Band max sq ft", "Home size",
             "Monthly range", "Monthly mid", "Bi-Weekly range", "Bi-Weekly mid", "Weekly range", "Weekly mid",
             "Deluxe range", "Deluxe mid", "Move In/Out range", "Move In/Out mid"]
    for i, h in enumerate(heads, start=1):
        c = ws.cell(row=5, column=i, value=h)
        c.font = BOLD
        c.fill = fill(LAV_LIGHT)
        c.border = BOX
        c.alignment = WRAP
        ws.column_dimensions[get_column_letter(i)].width = 14
    r = 6
    for row in RATE_CARD:
        vals = [row[0], row[1], row[2]]
        for rng, mid in row[3:]:
            vals += [rng, mid]
        for i, v in enumerate(vals, start=1):
            c = ws.cell(row=r, column=i, value=v)
            c.border = BOX
            if i in (5, 7, 9, 11, 13):
                c.number_format = MONEY
        r += 1
    ws["A14"] = "Rate card minimums (methodology list): Monthly $150 · Bi-weekly $110 · Weekly $110 · Deep $400 · Move $450 · One-time trip minimum $250"
    ws["A15"] = "Over 4,000 sq ft: custom quote, walk the home first."
    return ws


# ================================================================ ESTIMATOR
def build_estimator(wb, sref):
    ws = wb.active
    ws.title = "Estimator"
    widths = {"A": 2, "B": 36, "C": 24, "D": 24, "E": 20, "F": 40, "G": 3,
              "H": 30, "I": 14, "J": 11, "K": 13, "L": 11, "M": 3}
    for k, v in widths.items():
        ws.column_dimensions[k].width = v
    ws.sheet_view.showGridLines = False

    def st(key, col="C"):
        return f"Settings!${col}${sref[key]}"

    ws["B1"] = "Lemon and Lavender Cleaning Co. — Residential Estimator"
    ws["B1"].font = H1
    ws["B2"] = ("1) Pick the client in D4.  2) Fill or correct the yellow cells.  3) Check the status bar.  "
                "4) Copy the quote text into Jobber.  Grey = pulled from Jobber, bold = what the price uses.")
    ws["B2"].font = ITAL
    ws.merge_cells("B2:L2")

    # ---- picker
    ws["B4"] = "Pick the Jobber request (client name) ▸"
    ws["B4"].font = BOLD
    ws["C4"] = '=IF($N$1="","No request loaded","Requests row "&$N$1)'
    style(ws, "C4", GREY, ITAL)
    ws["D4"] = "Jane Sample"
    style(ws, "D4", LEMON, BOLD)
    ws.merge_cells("D4:E4")
    ws["F4"] = "Dropdown lists the Requests tab. Leave blank to price a phone call by hand."
    ws["F4"].font = ITAL
    ws["F4"].alignment = WRAP

    for col, t in zip("BCDEF", ["Field", "From Jobber (auto)", "Your entry / override", "Used for pricing", "Help"]):
        style(ws, f"{col}5", LAV_LIGHT, BOLD)
        ws[f"{col}5"] = t

    # helper column N (hidden)
    T = "$N$2"

    def parse(key):
        k = f'"{key}"'
        start = f"SEARCH({k},{T})"
        end = (f"MIN(IFERROR(SEARCH(\"|\",{T},{start}),LEN({T})+1),"
               f"IFERROR(SEARCH(CHAR(10),{T},{start}),LEN({T})+1))")
        return f"IFERROR(TRIM(MID({T},{start}+LEN({k}),{end}-{start}-LEN({k}))),\"\")"

    def num(key):
        return f'IFERROR(VALUE(SUBSTITUTE(SUBSTITUTE(LOWER({parse(key)}),"sq ft",""),",","")),"")'

    def req(colletter):
        return f'=IF($N$1="","",INDEX(Requests!${colletter}:${colletter},$N$1)&"")'

    # rows: (row, label, jobber formula, default entry, used formula, help, entry_fmt)
    fields = [
        (6, "Client name", req("E"), None, "=IF(D6<>\"\",D6,C6)", "", None),
        (7, "Street address", req("H"), None, "=IF(D7<>\"\",D7,C7)", "", None),
        (8, "City", req("I"), None, "=IF(D8<>\"\",D8,C8)", "Checked against Settings ▸ Service area.", None),
        (9, "Zip", req("K"), None, "=IF(D9<>\"\",D9,C9)", "", None),
        (10, "Jobber request link", req("C"), None, "=C10", "Open to see the request and photos.", None),
        (11, "Request title / source", '=IF($N$1="","",INDEX(Requests!$L:$L,$N$1)&" ("&INDEX(Requests!$D:$D,$N$1)&")")',
         None, "=C11", "", None),
        (12, "Requested service / frequency",
         f'=IF({parse("Cleaning frequency:")}<>"",{parse("Cleaning frequency:")},{parse("Service requested:")})',
         None, "=IF(D12<>\"\",D12,C12)", "Info only — every service is priced below.", None),
        (14, "Square footage *", f"={num('Square footage:')}", None, "=IF(D14<>\"\",D14,C14)",
         "Required. 300–10,000. Over 4,000 = walk-through.", "#,##0"),
        (15, "Bedrooms", f"={num('Bedrooms:')}", None, "=IF(D15<>\"\",D15,C15)", "", "0"),
        (16, "Bathrooms", f"={num('Bathrooms:')}", None, "=IF(D16<>\"\",D16,C16)",
         "Half baths = 0.5. Extra baths add time.", "0.0"),
        (17, "People living in home", f"={num('People in home:')}", None,
         f"=IF(D17<>\"\",D17,IF(C17<>\"\",C17,{st('occupants_included')}))", "Blank = 2.", "0"),
        (18, "Dogs", f"={num('Dogs:')}", None, "=IF(D18<>\"\",D18,IF(C18<>\"\",C18,0))", "", "0"),
        (19, "Cats", f"={num('Cats:')}", None, "=IF(D19<>\"\",D19,IF(C19<>\"\",C19,0))", "", "0"),
        (20, "Other animals", f"={num('Other animals:')}", None, "=IF(D20<>\"\",D20,IF(C20<>\"\",C20,0))", "", "0"),
        (21, "Date of last professional cleaning",
         f'=IFERROR(DATEVALUE({parse("Last professional cleaning:")}),"")', None,
         "=IF(D21<>\"\",D21,C21)", "Blank = never / unknown (priced as 24+ months).", "yyyy-mm-dd"),
        (23, "Dirt code (1–11) *", "", None, "=IF(D23<>\"\",D23,C23)",
         "Required. 1 = cleanest ever, 10 = heavy buildup, 11 = WE DO NOT SERVICE.", "0"),
        (24, "Photo links", req("N"), None, '=TRIM(C24&" "&D24)', "Paste Drive/Jobber photo links.", None),
        (25, "Photo review: adjusted dirt code", "", None, "=D25", "Optional. Replaces the dirt code above.", "0"),
        (26, "Photo review: price adjustment %", "", None, '=IF(D26="",0,D26)',
         "Optional, e.g. 10% or -5%. Applies to every service.", PCT),
        (27, "Photo review: reason", "", None, "=D27", "Required if you changed anything above.", None),
        (28, "Dirt code used", "", None, '=IF(D25<>"",D25,E23)', "", "0"),
        (30, "Inside refrigerator", "", "No", '=IF(D30="Yes","Yes","No")', "Add-on.", None),
        (31, "Inside oven", "", "No", '=IF(D31="Yes","Yes","No")', "Add-on.", None),
        (32, "Interior windows (number of windows)", "", 0, '=IF(D32="",0,D32)', "Add-on. 0 = none.", "0"),
        (33, "Promo $ off Initial Deep Clean",
         '=IFERROR(VALUE(MID($N$2,SEARCH("Offer: $",$N$2)+8,'
         'SEARCH(" off",$N$2,SEARCH("Offer: $",$N$2))-SEARCH("Offer: $",$N$2)-8)),"")',
         None, '=IF(D33<>"",D33,IF(C33<>"",C33,0))', "Auto-filled from Meta offers. Type 0 to remove.", MONEY),
    ]
    section(ws, 13, "HOME DETAILS")
    section(ws, 22, "CONDITION & PHOTOS")
    section(ws, 29, "ADD-ONS & PROMO")
    for row, label, jf, default, used, helptext, fmt in fields:
        ws[f"B{row}"] = label
        style(ws, f"B{row}", font=BOLD if "*" in label else None)
        if jf:
            ws[f"C{row}"] = jf
        style(ws, f"C{row}", GREY, ITAL, fmt=fmt)
        if row != 28 and row != 10 and row != 11:
            if default is not None:
                ws[f"D{row}"] = default
            style(ws, f"D{row}", LEMON, fmt=fmt)
        else:
            style(ws, f"D{row}", GREY)
        ws[f"E{row}"] = used
        style(ws, f"E{row}", font=BOLD, fmt=fmt)
        ws[f"F{row}"] = helptext
        style(ws, f"F{row}", font=ITAL, align=WRAP)
    # worked example entries
    example = {"D17": 4, "D18": 1, "D19": 1, "D21": date(2026, 3, 1), "D23": 6, "D25": 7,
               "D27": "Kitchen grease and pet hair visible in photos", "D30": "Yes", "D32": 12}
    for k, v in example.items():
        ws[k] = v

    # ---- helpers (column N, hidden)
    area = f"Settings!$B${sref['area_first']}:$B${sref['area_last']}"
    dirt_tbl = f"Settings!$B${sref['dirt_first']}:$C${sref['dirt_last']}"
    bands_m = f"Settings!$B${sref['band_first']}:$B${sref['band_last']}"
    bands_f = f"Settings!$C${sref['band_first']}:$C${sref['band_last']}"
    helpers = {
        "N1": '=IF($D$4="","",IFERROR(MATCH($D$4,Requests!$E:$E,0),""))',
        "N2": '=IF($N$1="","",INDEX(Requests!$M:$M,$N$1)&"")',
        "N3": (f'=IF(E14="","Square footage is required. ",IF(NOT(ISNUMBER(E14)),"Square footage must be a number. ",'
               f'IF(OR(E14<{st("min_sqft")},E14>{st("max_sqft")}),"Square footage must be "&TEXT({st("min_sqft")},"#,##0")'
               f'&"–"&TEXT({st("max_sqft")},"#,##0")&". ","")))'
               f'&IF(E28="","Dirt code is required. ",IF(NOT(ISNUMBER(E28)),"Dirt code must be a whole number 1–11. ",'
               f'IF(OR(E28<1,E28>11,E28<>INT(E28)),"Dirt code must be a whole number 1–11. ","")))'
               f'&IF(OR(N(E17)<1,N(E18)<0,N(E19)<0,N(E20)<0),"People/animal counts can\'t be negative (at least 1 person). ","")'),
        "N4": "=AND(ISNUMBER(E28),E28=11)",
        "N5": '=AND(N3="",NOT(N4))',
        "N6": f'=IF(E21="",{st("months_if_unknown")},MAX(0,(TODAY()-E21)/30.4375))',
        "N7": f"=IF(ISNUMBER(E14),MAX(0,N(E16)-E14/{st('sqft_per_included_bath')}),0)",
        "N8": f"=MIN({st('occupant_cap')},MAX(0,N(E17)-{st('occupants_included')})*{st('per_extra_occupant')})",
        "N9": (f"=MIN({st('pet_cap')},N(E18)*{st('per_dog')}+N(E19)*{st('per_cat')}"
               f"+N(E20)*{st('per_other_animal')})"),
        "N10": f"=IFERROR(VLOOKUP(E28,{dirt_tbl},2,FALSE),1)",
        "N11": f"=LOOKUP(N6,{bands_m},{bands_f})",
        "N12": "=1+N(E26)",
        "N13": '=IF(E6="","there",LEFT(E6,FIND(" ",E6&" ")-1))',
    }
    for k, v in helpers.items():
        ws[k] = v
    ws["N10"].number_format = "0.00"
    ws.column_dimensions["N"].hidden = True

    # ---- status
    ws["B35"] = "STATUS"
    style(ws, "B35", LAV, H2)
    ws["C35"] = ('=IF(N4,"⛔ WE DO NOT SERVICE THIS HOME (dirt code 11). No estimate — send the decline note.",'
                 'IF(N3<>"","⚠ Fix before quoting: "&N3,"✅ Ready to quote"))')
    ws.merge_cells("C35:F35")
    style(ws, "C35", font=Font(bold=True, size=12), align=WRAP)
    ws.row_dimensions[35].height = 34
    ws["B36"] = "Warnings"
    style(ws, "B36", LAV_LIGHT, BOLD)
    warn = (f'IF(AND(ISNUMBER(E14),E14>{st("walkthrough_sqft")}),"Over "&TEXT({st("walkthrough_sqft")},"#,##0")'
            f'&" sq ft — walk-through required before final price. ","")'
            f'&IF(AND(E8<>"",ISNA(MATCH(E8,{area},0))),"City is outside the service area — confirm before quoting. ","")'
            f'&IF(AND(OR(D25<>"",N(E26)<>0),D27=""),"Photo review changed the price — add a reason. ","")'
            f'&IF(OR(E15="",E16=""),"Beds/baths missing. ","")')
    ws["C36"] = f'=IF({warn}="","None",{warn})'
    ws.merge_cells("C36:F36")
    style(ws, "C36", align=WRAP)
    ws.row_dimensions[36].height = 34
    red = FormulaRule(formula=['ISNUMBER(SEARCH("DO NOT",$C$35))'], fill=fill("C00000"),
                      font=Font(bold=True, color=WHITE))
    amber = FormulaRule(formula=['ISNUMBER(SEARCH("Fix",$C$35))'], fill=fill("FFC000"))
    green = FormulaRule(formula=['ISNUMBER(SEARCH("Ready",$C$35))'], fill=fill("C6EFCE"))
    for rule in (red, amber, green):
        ws.conditional_formatting.add("C35", rule)
    ws.conditional_formatting.add("C36", FormulaRule(formula=['$C$36<>"None"'], fill=fill("FCE4D6")))

    # ---- calculation block
    C0 = 50
    section(ws, C0, "HOW THE PRICE WAS CALCULATED (read-only — change numbers on the Settings tab)", "B", "H")
    style(ws, f"B{C0+1}", LAV_LIGHT, BOLD)
    ws[f"B{C0+1}"] = "Step"
    for col, name in zip(SVC_COLS, SVC_NAMES):
        ws[f"{col}{C0+1}"] = name
        style(ws, f"{col}{C0+1}", LAV_LIGHT, BOLD, align=Alignment(horizontal="center"))

    def srow(key):
        return sref[key]

    addon_total = "$D$83"
    calc = [
        ("rate", "Production rate (sq ft per labor hour)", lambda c: f"=Settings!{c}${srow('production_rate')}", "#,##0"),
        ("base", "Base hours = sq ft ÷ production rate", lambda c: f"=IFERROR($E$14/{c}{{rate}},0)", HRS),
        ("bath", "+ Extra-bathroom hours", lambda c: f"=$N$7*Settings!{c}${srow('extra_bath_hours')}", HRS),
        ("scope", "× Scope multiplier", lambda c: f"=Settings!{c}${srow('scope_multiplier')}", "0.00"),
        ("dirt", "× Dirt code factor", lambda c: f"=1+($N$10-1)*Settings!{c}${srow('dirt_sensitivity')}", "0.000"),
        ("occ", "× People factor", lambda c: f"=1+Settings!{c}${srow('household_factors_apply')}*$N$8", "0.000"),
        ("pet", "× Pet factor", lambda c: f"=1+Settings!{c}${srow('household_factors_apply')}*$N$9", "0.000"),
        ("last", "× Time-since-last-clean factor",
         lambda c: f"=IF(Settings!{c}${srow('last_clean_applies')}=1,$N$11,1)", "0.000"),
        ("hours", "→ Labor hours (rounded up)",
         lambda c: (f"=CEILING(({c}{{base}}+{c}{{bath}})*{c}{{scope}}*{c}{{dirt}}*{c}{{occ}}*{c}{{pet}}*{c}{{last}},"
                    f"{st('hours_rounding')})"), HRS),
        ("onsite", "On-site time for the team", lambda c: f"={c}{{hours}}/{st('team_size')}", HRS),
        ("brate", "× Billable rate", lambda c: f"=Settings!{c}${srow('billable_rate')}", MONEY),
        ("labor", "→ Labor price", lambda c: f"={c}{{hours}}*{c}{{brate}}", MONEY2),
        ("photo", "× Photo review adjustment", lambda c: f"={c}{{labor}}*$N$12", MONEY2),
        ("round", "Rounded up to nearest $5", lambda c: f"=CEILING(MAX(0,{c}{{photo}}),{st('price_rounding')})", MONEY),
        ("min", "Minimum for this service",
         lambda c: (f"=MAX(Settings!{c}${srow('minimum_price')},IF(Settings!{c}${srow('one_time')}=1,"
                    f"{st('trip_minimum_one_time')},0))"), MONEY),
        ("svc", "→ Service price (higher of the two)", lambda c: f"=MAX({c}{{round}},{c}{{min}})", MONEY),
        ("minflag", "Minimum applied?", lambda c: f'=IF({c}{{min}}>{c}{{round}},"Yes","No")', None),
        ("promo", "− Promo (Initial Deep only)", lambda c: "=-$E$33" if c == "F" else "=0", MONEY),
        ("addons", "+ Add-ons (per visit)", lambda c: f"={addon_total}", MONEY),
        ("total", "TOTAL incl. add-ons", lambda c: f'=IF($N$5,{c}{{svc}}+{c}{{promo}}+{c}{{addons}},"—")', MONEY),
        ("freq", "Visit time vs. Monthly (frequency effect)",
         lambda c: f"=Settings!$C${srow('production_rate')}/{c}{{rate}}" if c in "CDE" else '="—"', PCT),
        ("eff", "Effective $ per labor hour (service price)",
         lambda c: f'=IF(AND($N$5,{c}{{hours}}>0),{c}{{svc}}/{c}{{hours}},"—")', MONEY2),
        ("card", "Rate card midpoint at $85 (reference)", None, MONEY),
        ("diff", "Service price vs. rate card", lambda c: f'=IF(AND($N$5,ISNUMBER({c}{{card}})),{c}{{svc}}-{c}{{card}},"—")', MONEY),
    ]
    rowof = {}
    r = C0 + 2
    for key, *_ in calc:
        rowof[key] = r
        r += 1
    card_col = {"C": "E", "D": "G", "E": "I", "F": "K", "G": None, "H": "M"}
    for key, label, fn, fmt in calc:
        rr = rowof[key]
        ws[f"B{rr}"] = label
        style(ws, f"B{rr}", font=BOLD if label.startswith("→") or key == "total" else None)
        for c in SVC_COLS:
            if key == "card":
                cc = card_col[c]
                if cc is None:
                    f = '="n/a"'
                else:
                    f = (f'=IFERROR(IF($E$14>{st("walkthrough_sqft")},"Custom",'
                         f"LOOKUP($E$14,'Rate Card'!$A$6:$A$12,'Rate Card'!${cc}$6:${cc}$12)),\"—\")")
            else:
                f = fn(c).format(**rowof)
            ws[f"{c}{rr}"] = f
            style(ws, f"{c}{rr}", GREY if key != "total" else LEMON,
                  BOLD if key in ("total", "svc", "hours") else None, fmt=fmt,
                  align=Alignment(horizontal="right"))

    # ---- add-on block
    section(ws, 78, "ADD-ONS (per visit)", "B", "D")
    for col, t in zip("BCD", ["Add-on", "Hours", "Price"]):
        ws[f"{col}79"] = t
        style(ws, f"{col}79", LAV_LIGHT, BOLD)
    items = [
        (80, "Inside refrigerator", f'=IF($E$30="Yes",{st("fridge_hours")},0)'),
        (81, "Inside oven", f'=IF($E$31="Yes",{st("oven_hours")},0)'),
        (82, "Interior windows", f"=N($E$32)*{st('window_hours_each')}"),
    ]
    for rr, label, hf in items:
        ws[f"B{rr}"] = label
        style(ws, f"B{rr}")
        ws[f"C{rr}"] = hf
        style(ws, f"C{rr}", GREY, fmt=HRS)
        ws[f"D{rr}"] = f"=CEILING(C{rr}*{st('addon_rate')},{st('price_rounding')})"
        style(ws, f"D{rr}", GREY, fmt=MONEY)
    ws["B83"] = "Add-ons total"
    style(ws, "B83", font=BOLD)
    ws["D83"] = "=SUM(D80:D82)"
    style(ws, "D83", LEMON, BOLD, fmt=MONEY)

    # ---- results panel
    section(ws, 4, "ESTIMATES", "H", "L")
    for col, t in zip("HIJKL", ["Service", "Price", "Labor hrs", "On-site hrs", "In quote?"]):
        style(ws, f"{col}5", LAV_LIGHT, BOLD, align=Alignment(horizontal="center", wrap_text=True))
        ws[f"{col}5"] = t
    panel = [  # (row, label, calc column)
        (6, "Initial Deep Clean", "F"), (7, "Deluxe Deep Clean", "G"), (8, "Move-In / Move-Out", "H"),
        (9, "Weekly (per visit)", "E"), (10, "Bi-Weekly (per visit)", "D"), (11, "Monthly (per visit)", "C"),
    ]
    dv_yn = DataValidation(type="list", formula1='"Yes,No"', allow_blank=False)
    ws.add_data_validation(dv_yn)
    for rr, label, c in panel:
        ws[f"H{rr}"] = f'="{label}"&IF(AND($N$5,{c}{rowof["minflag"]}="Yes"),"  (minimum)","")'
        style(ws, f"H{rr}", font=BOLD)
        ws[f"I{rr}"] = f'=IF($N$5,{c}{rowof["svc"]}+{c}{rowof["promo"]},"—")'
        style(ws, f"I{rr}", LEMON, Font(bold=True, size=12), fmt=MONEY, align=Alignment(horizontal="right"))
        ws[f"J{rr}"] = f'=IF($N$5,{c}{rowof["hours"]},"—")'
        style(ws, f"J{rr}", fmt=HRS, align=Alignment(horizontal="right"))
        ws[f"K{rr}"] = f'=IF($N$5,{c}{rowof["onsite"]},"—")'
        style(ws, f"K{rr}", fmt=HRS, align=Alignment(horizontal="right"))
        ws[f"L{rr}"] = "Yes"
        style(ws, f"L{rr}", LEMON, align=Alignment(horizontal="center"))
        dv_yn.add(f"L{rr}")
    ws["H12"] = "Add-ons selected (per visit)"
    style(ws, "H12", font=BOLD)
    ws["I12"] = '=IF($N$5,$D$83,"—")'
    style(ws, "I12", fmt=MONEY, align=Alignment(horizontal="right"))
    ws["H13"] = '="On-site hrs assume a team of "&' + st("team_size") + '&". Initial Deep includes the promo."'
    ws["H13"].font = ITAL
    ws.merge_cells("H13:L13")

    # ---- quote text
    section(ws, 14, "QUOTE TEXT — copy this cell into the Jobber quote / message", "H", "L")
    NL = "CHAR(10)"

    def money(cell):
        return f'TEXT({cell},"$#,##0")'

    one_time = (f'IF(OR(L6="Yes",L7="Yes",L8="Yes"),"ONE-TIME CLEANS"&{NL}'
                f'&IF(L6="Yes","• Initial Deep Clean: "&{money("I6")}&IF(E33>0," (includes $"&E33&" off promo)","")&{NL},"")'
                f'&IF(L7="Yes","• Deluxe Deep Clean: "&{money("I7")}&{NL},"")'
                f'&IF(L8="Yes","• Move-In / Move-Out Clean: "&{money("I8")}&{NL},"")&{NL},"")')
    recurring = (f'IF(OR(L9="Yes",L10="Yes",L11="Yes"),"RECURRING MAINTENANCE (per visit, after an initial deep clean)"&{NL}'
                 f'&IF(L9="Yes","• Weekly: "&{money("I9")}&{NL},"")'
                 f'&IF(L10="Yes","• Every 2 weeks: "&{money("I10")}&{NL},"")'
                 f'&IF(L11="Yes","• Monthly: "&{money("I11")}&{NL},"")&{NL},"")')
    addons = (f'IF($D$83>0,"ADD-ONS (per visit)"&{NL}'
              f'&IF($D$80>0,"• Inside refrigerator: "&{money("$D$80")}&{NL},"")'
              f'&IF($D$81>0,"• Inside oven: "&{money("$D$81")}&{NL},"")'
              f'&IF($D$82>0,"• Interior windows ("&$E$32&"): "&{money("$D$82")}&{NL},"")&{NL},"")')
    body = (f'"Hi "&$N$13&","&{NL}&{NL}&"Thanks for reaching out to Lemon and Lavender Cleaning Co.! Based on your "'
            f'&TEXT($E$14,"#,##0")&" sq ft home"&IF(AND($E$15<>"",$E$16<>"")," ("&$E$15&" bed / "&$E$16&" bath)","")'
            f'&IF($E$7<>""," at "&$E$7,"")&", here are your estimated prices:"&{NL}&{NL}'
            f'&{one_time}&{recurring}&{addons}&Settings!$C${sref["closing"]}')
    decline = f'"Hi "&$N$13&","&{NL}&{NL}&Settings!$C${sref["decline"]}'
    ws["H15"] = (f'=IF($N$4,{decline},IF(NOT($N$5),"Complete the required fields (see STATUS) to generate the quote text.",'
                 f'{body}))')
    ws.merge_cells("H15:L34")
    style(ws, "H15", WHITE, align=WRAP)

    # ---- Jobber line items
    section(ws, 36, "JOBBER LINE ITEMS (for building the quote)", "H", "L")
    for col, t in zip("HIL", ["Line item", "Description", "Unit price"]):
        style(ws, f"{col}37", LAV_LIGHT, BOLD)
        ws[f"{col}37"] = t
    ws.merge_cells("I37:K37")
    lines = [
        (38, "L6", "Initial Deep Clean", "F"), (39, "L7", "Deluxe Deep Clean", "G"),
        (40, "L8", "Move-In / Move-Out Clean", "H"), (41, "L9", "Weekly Maintenance Clean", "E"),
        (42, "L10", "Bi-Weekly Maintenance Clean", "D"), (43, "L11", "Monthly Maintenance Clean", "C"),
    ]
    for rr, incl, name, c in lines:
        cond = f'AND($N$5,{incl}="Yes")'
        ws[f"H{rr}"] = f'=IF({cond},"{name}","")'
        ws[f"I{rr}"] = f'=IF({cond},Settings!{c}${sref["desc"]},"")'
        ws.merge_cells(f"I{rr}:K{rr}")
        ws[f"L{rr}"] = f'=IF({cond},{c}{rowof["svc"]},"")'
        for col in "HIL":
            style(ws, f"{col}{rr}", fmt=MONEY if col == "L" else None)
    extra = [
        (44, '$D$80>0', "Inside Refrigerator (add-on)", '"Interior refrigerator cleaning"', "$D$80"),
        (45, '$D$81>0', "Inside Oven (add-on)", '"Interior oven cleaning"', "$D$81"),
        (46, '$D$82>0', "Interior Windows (add-on)", '$E$32&" interior windows"', "$D$82"),
        (47, 'AND(L6="Yes",$E$33>0)', "Promo discount (Initial Deep)", '"Promotional discount"', "-$E$33"),
    ]
    for rr, cond, name, desc, price in extra:
        cond = f"AND($N$5,{cond})"
        ws[f"H{rr}"] = f'=IF({cond},"{name}","")'
        ws[f"I{rr}"] = f'=IF({cond},{desc},"")'
        ws.merge_cells(f"I{rr}:K{rr}")
        ws[f"L{rr}"] = f'=IF({cond},{price},"")'
        for col in "HIL":
            style(ws, f"{col}{rr}", fmt=MONEY if col == "L" else None)
    ws["H48"] = "Tip: add these as optional line items in Jobber so the client picks one."
    ws["H48"].font = ITAL

    # ---- validation on inputs
    def dv(kind, cells, op=None, f1=None, f2=None, prompt=None, err=None):
        v = DataValidation(type=kind, operator=op, formula1=f1, formula2=f2, allow_blank=True,
                           showErrorMessage=True, error=err, errorTitle="Check this entry",
                           prompt=prompt, showInputMessage=bool(prompt))
        ws.add_data_validation(v)
        v.add(cells)

    dv("list", "D4", f1="Requests!$E$2:$E$2000", prompt="Pick the client from the Requests tab")
    dv("decimal", "D14", "between", "300", "10000", err="Square footage must be 300–10,000.")
    dv("whole", "D15", "between", "0", "15", err="Bedrooms: whole number 0–15.")
    dv("decimal", "D16", "between", "0", "15", err="Bathrooms: 0–15 (use .5 for half baths).")
    dv("whole", "D17", "between", "1", "20", err="People: whole number 1–20.")
    dv("whole", "D18:D20", "between", "0", "20", err="Animals: whole number 0–20.")
    dv("date", "D21", "between", "36526", "73051", err="Enter a date, e.g. 2026-03-01.")
    dv("whole", "D23", "between", "1", "11", prompt="1 = cleanest ever · 10 = heavy buildup · 11 = we do not service",
       err="Dirt code must be a whole number 1–11.")
    dv("whole", "D25", "between", "1", "11", err="Dirt code must be a whole number 1–11.")
    dv("decimal", "D26", "between", "-0.5", "0.5", err="Enter a % between -50% and 50%.")
    dv("list", "D30:D31", f1='"Yes,No"')
    dv("whole", "D32", "between", "0", "200", err="Windows: whole number 0–200.")
    dv("decimal", "D33", "between", "0", "1000", err="Promo: $0–$1,000.")
    ws.freeze_panes = "A4"
    return rowof


# ================================================================ HOW TO
def build_howto(wb):
    ws = wb.create_sheet("How To Use")
    ws.column_dimensions["A"].width = 2
    ws.column_dimensions["B"].width = 120
    lines = [
        ("Lemon and Lavender Cleaning Co. — How to price a request", H1),
        ("", None),
        ("PRICING A NEW REQUEST", BOLD),
        ("1. New Jobber requests land on the Requests tab automatically (Zapier). Phone calls: skip the dropdown and type everything in the yellow cells.", None),
        ("2. On Estimator, pick the client in the yellow box at D4. Grey cells fill in from the request.", None),
        ("3. Fill or correct the yellow cells. Anything you type in 'Your entry' wins over the Jobber value.", None),
        ("4. Look at the photos (Jobber link). Enter the dirt code. If photos change your mind, use the Photo review rows and write the reason.", None),
        ("5. STATUS must be green. Red = dirt code 11: do not quote, send the decline text. Amber = something is missing.", None),
        ("6. Set 'In quote?' to No for services the client doesn't need. Copy the QUOTE TEXT cell into Jobber, and use the line items block to build the quote.", None),
        ("7. On the Requests tab, set Status, Service Quoted, Price Quoted, Quoted By and Date Quoted.", None),
        ("8. Before the next request, clear the yellow cells you typed in (or pick the next client — overrides stay until you clear them!).", None),
        ("", None),
        ("DIRT CODE", BOLD),
        ("1 = cleanest home you've ever seen · 5 = average lived-in · 10 = heavy buildup of dirt, debris, grime and clutter · 11 = WE DO NOT SERVICE (biohazard / hoarding).", None),
        ("", None),
        ("CHANGING PRICES", BOLD),
        ("Only change numbers on the Settings tab (blue cells). Never type over grey or bold cells on the Estimator.", None),
        ("The 'How the price was calculated' table at the bottom of Estimator shows every step for every service.", None),
        ("", None),
        ("ONE PERSON AT A TIME", BOLD),
        ("The Estimator tab is shared. If two people quote at once, one of you should right-click the Estimator tab ▸ Duplicate and use the copy.", None),
    ]
    for i, (t, f) in enumerate(lines, start=1):
        ws[f"B{i}"] = t
        ws[f"B{i}"].alignment = WRAP
        if f:
            ws[f"B{i}"].font = f


def build(path: Path = OUT, overrides: dict | None = None, requests_rows: list | None = None) -> dict:
    """Build the workbook. overrides = {"D14": 2000, ...} for tests."""
    wb = Workbook()
    est_placeholder = wb.active
    sref = build_settings(wb)
    build_requests(wb)
    build_rate_card(wb)
    wb.active = 0
    rowof = build_estimator(wb, sref)
    assert est_placeholder.title == "Estimator"
    build_howto(wb)
    ws = wb["Estimator"]
    if requests_rows:
        rq = wb["Requests"]
        for i, row in enumerate(requests_rows, start=3):
            for j, v in enumerate(row, start=1):
                rq.cell(row=i, column=j, value=v)
    for k, v in (overrides or {}).items():
        ws[k] = v
    wb.save(path)
    return rowof


if __name__ == "__main__":
    build()
    print(f"Wrote {OUT}")
