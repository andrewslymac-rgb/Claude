"""Cross-check: Sheet formulas (recalculated by LibreOffice) == pricing.py.

    cd cleaning-estimator && python3 -m pytest -q test_estimator.py

Needs LibreOffice (`soffice`) on PATH; skips otherwise.
"""

from __future__ import annotations

import shutil
import subprocess
from datetime import date, datetime, timedelta

import pytest
from openpyxl import load_workbook

import build_estimator as B
from pricing import EstimateInput, estimate

pytestmark = pytest.mark.skipif(shutil.which("soffice") is None, reason="LibreOffice not installed")

TODAY = date.today()
# Quote-tab price row -> (service key, Breakdown column)
PANEL = {8: ("deluxe_deep", "F"), 9: ("move", "G"),
         12: ("weekly", "E"), 13: ("biweekly", "D"), 14: ("monthly", "C")}

CUSTOM_CLEAR = {f"custom_{w}_{i}": None for i in range(1, 7) for w in ("area", "sqft", "extra")}

CLEAR = {k: None for k in ["living", "kitchens", "bonus", "pick", "sqft", "beds", "baths", "people", "dogs", "cats", "other", "last_clean",
                           "dirt", "photo_dirt", "photo_pct", "photo_why", "windows", "promo"]}
CLEAR.update({"fridge": "No", "oven": "No"})
ALL_IN = {f"M{r}": "Yes" for r in (8, 9, 12, 13, 14, 15)}  # every service switched on for the quote

SCENARIOS = {
    "worked_example": (
        dict(ALL_IN),
        EstimateInput(sqft=1850, bedrooms=3, bathrooms=2.5, dirt_code=6, photo_dirt_code=7,
                      photo_reason="x", occupants=4, dogs=1, cats=1, last_pro_clean=date(2026, 3, 1),
                      fridge=True, windows=12, promo_off_deluxe=50, city="Milwaukie", today=TODAY),
    ),
    "phone_call_average_home": (
        {**CLEAR, "city": "Gresham", "sqft": 2400, "beds": 4, "baths": 3, "dirt": 5},
        EstimateInput(sqft=2400, bedrooms=4, bathrooms=3, dirt_code=5, city="Gresham", today=TODAY),
    ),
    "tiny_clean_home_hits_minimums": (
        {**CLEAR, "sqft": 600, "beds": 1, "baths": 1, "dirt": 1, "people": 1,
         "last_clean": TODAY - timedelta(days=10)},
        EstimateInput(sqft=600, bedrooms=1, bathrooms=1, dirt_code=1, occupants=1,
                      last_pro_clean=TODAY - timedelta(days=10), today=TODAY),
    ),
    "big_home_pets_photo_bump": (
        {**CLEAR, "city": "Beaverton", "sqft": 4500, "beds": 5, "baths": 4.5, "dirt": 8, "people": 6,
         "dogs": 3, "cats": 2, "other": 1, "photo_pct": 0.1, "oven": "Yes", "promo": 25},
        EstimateInput(sqft=4500, bedrooms=5, bathrooms=4.5, dirt_code=8, occupants=6, dogs=3, cats=2,
                      other_animals=1, photo_adjust_pct=0.1, oven=True, promo_off_deluxe=25,
                      city="Beaverton", today=TODAY),
    ),
    "dirt_code_11": (
        {**CLEAR, "sqft": 1500, "beds": 2, "baths": 1, "dirt": 11},
        EstimateInput(sqft=1500, bedrooms=2, bathrooms=1, dirt_code=11, today=TODAY),
    ),
    "photo_review_bumps_to_11": (
        {**CLEAR, "sqft": 1500, "beds": 2, "baths": 1, "dirt": 7, "photo_dirt": 11, "photo_why": "Hoarding"},
        EstimateInput(sqft=1500, bedrooms=2, bathrooms=1, dirt_code=7, photo_dirt_code=11,
                      photo_reason="y", today=TODAY),
    ),
    "last_clean_never": (
        {**CLEAR, "sqft": 1800, "beds": 3, "baths": 2, "dirt": 5, "people": 2, "dogs": 0, "cats": 0,
         "other": 0, "last_clean": "never", "living": 1, "kitchens": 1, "bonus": 0},
        EstimateInput(sqft=1800, bedrooms=3, bathrooms=2, dirt_code=5, occupants=2, today=TODAY),
    ),
    "team_price_outside_range": (
        {**ALL_IN, "K12": 999},
        EstimateInput(sqft=1850, bedrooms=3, bathrooms=2.5, dirt_code=6, photo_dirt_code=7,
                      photo_reason="x", occupants=4, dogs=1, cats=1, last_pro_clean=date(2026, 3, 1),
                      fridge=True, windows=12, promo_off_deluxe=50, city="Milwaukie", today=TODAY),
    ),
    "custom_only_basement": (
        {**CLEAR, "dirt": 6, "dogs": 1, "people": 3, "custom_type": "Deep",
         "custom_area_1": "Basement", "custom_sqft_1": 800, "custom_extra_1": 0.5,
         "custom_area_2": "Laundry room", "custom_sqft_2": 120},
        EstimateInput(sqft=None, dirt_code=6, dogs=1, occupants=3, custom_type="Deep",
                      custom_areas=[(800, 0.5), (120, 0)], today=TODAY),
    ),
    "custom_plus_full_home": (
        {**CLEAR, "sqft": 2400, "beds": 4, "baths": 3, "dirt": 5, "custom_type": "Move-out",
         "custom_area_1": "Garage", "custom_sqft_1": 500},
        EstimateInput(sqft=2400, bedrooms=4, bathrooms=3, dirt_code=5, custom_type="Move-out",
                      custom_areas=[(500, 0)], today=TODAY),
    ),
    "custom_recurring_small": (
        {**CLEAR, "dirt": 3, "custom_type": "Weekly", "custom_area_1": "Main floor bath", "custom_sqft_1": 80},
        EstimateInput(sqft=None, dirt_code=3, custom_type="Weekly", custom_areas=[(80, 0)], today=TODAY),
    ),
    "custom_missing_type": (
        {**CLEAR, "dirt": 5, "custom_area_1": "Basement", "custom_sqft_1": 800},
        EstimateInput(sqft=None, dirt_code=5, custom_areas=[(800, 0)], today=TODAY),
    ),
    "extra_rooms": (
        {**CLEAR, "sqft": 3000, "beds": 4, "baths": 3, "dirt": 5, "living": 2, "kitchens": 2, "bonus": 2},
        EstimateInput(sqft=3000, bedrooms=4, bathrooms=3, dirt_code=5, living_rooms=2, kitchens=2, bonus_rooms=2,
                      today=TODAY),
    ),
    "rooms_hit_cap": (
        {**CLEAR, "sqft": 3000, "beds": 4, "baths": 3, "dirt": 5, "living": 4, "kitchens": 3, "bonus": 4},
        EstimateInput(sqft=3000, bedrooms=4, bathrooms=3, dirt_code=5, living_rooms=4, kitchens=3, bonus_rooms=4,
                      today=TODAY),
    ),
    "only_deluxe_and_monthly": (
        {"M8": "Yes", "M14": "Yes"},
        EstimateInput(sqft=1850, bedrooms=3, bathrooms=2.5, dirt_code=6, photo_dirt_code=7,
                      photo_reason="x", occupants=4, dogs=1, cats=1, last_pro_clean=date(2026, 3, 1),
                      fridge=True, windows=12, promo_off_deluxe=50, city="Milwaukie", today=TODAY),
    ),
    "nothing_picked": (
        {},
        EstimateInput(sqft=1850, bedrooms=3, bathrooms=2.5, dirt_code=6, photo_dirt_code=7,
                      photo_reason="x", occupants=4, dogs=1, cats=1, last_pro_clean=date(2026, 3, 1),
                      fridge=True, windows=12, promo_off_deluxe=50, city="Milwaukie", today=TODAY),
    ),
    "missing_beds": (
        {**CLEAR, "sqft": 1500, "beds": None, "baths": None, "dirt": 5},
        EstimateInput(sqft=1500, dirt_code=5, today=TODAY),
    ),
    "missing_sqft": (
        {**CLEAR, "dirt": 5},
        EstimateInput(sqft=None, dirt_code=5, today=TODAY),
    ),
    "missing_dirt_code": (
        {**CLEAR, "sqft": 1500, "beds": 2, "baths": 1},
        EstimateInput(sqft=1500, bedrooms=2, bathrooms=1, today=TODAY),
    ),
}


# Two more requests after the sample row, one a repeat client, to test the newest-first dropdown.
EXTRA_REQUESTS = [
    [datetime(2026, 11, 3, 8, 0), "REQ-2", "https://x/2", "external", "Deborah Field"],  # a real date cell
    ["11/4/2026, 7:30:00 PM", "REQ-3", "https://x/3", "external", "Jane Sample"],
]


@pytest.fixture(scope="module")
def wbs(tmp_path_factory):
    src = tmp_path_factory.mktemp("src")
    out = tmp_path_factory.mktemp("out")
    paths = []
    for name, (answers, _) in SCENARIOS.items():
        p = src / f"{name}.xlsx"
        B.build(p, answers={**CUSTOM_CLEAR, "M15": "Yes", **answers} if name.startswith("custom") else answers,
                extra_requests=EXTRA_REQUESTS if name == "worked_example" else None)
        paths.append(str(p))
    subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", str(out), *paths],
                   check=True, capture_output=True, timeout=300)
    return {name: load_workbook(out / f"{name}.xlsx", data_only=True) for name in SCENARIOS}


@pytest.mark.parametrize("name", list(SCENARIOS))
def test_sheet_matches_python(wbs, name):
    q, bd = wbs[name]["Quote"], wbs[name]["Breakdown"]
    py = estimate(SCENARIOS[name][1])
    status = q["B2"].value
    if py.status == "do_not_service":
        assert "DO NOT SERVICE" in status
        assert all(q[f"I{r}"].value == "—" for r in PANEL)
        assert "not able to take on this cleaning" in q["G19"].value
        return
    if py.status == "invalid":
        assert status.startswith("⚠")
        for e in py.errors:  # same message, word for word
            assert e.split(" ")[0] in status
        assert all(q[f"I{r}"].value == "—" for r in PANEL)
        return
    assert "Ready to quote" in status, status
    for r, (svc, col) in PANEL.items():
        if svc not in py.services:  # custom-only quote: no full-home prices
            assert q[f"I{r}"].value == "—", (svc, q[f"I{r}"].value)
            continue
        se = py.services[svc]
        assert q[f"I{r}"].value == pytest.approx(se.service_price + se.promo), (svc, "price")
        assert q[f"H{r}"].value == pytest.approx(se.low + se.promo), (svc, "low")
        assert q[f"J{r}"].value == pytest.approx(se.high + se.promo), (svc, "high")
        assert bd[f"{col}{B.CALC['hours']}"].value == pytest.approx(se.labor_hours), (svc, "hours")
        assert q[f"L{r}"].value == pytest.approx(se.onsite_hours), (svc, "on-site")
    if py.custom:
        assert q["I15"].value == pytest.approx(py.custom.service_price), "custom price"
        assert q["H15"].value == pytest.approx(py.custom.low), "custom low"
        assert q["J15"].value == pytest.approx(py.custom.high), "custom high"
        assert q["L15"].value == pytest.approx(py.custom.onsite_hours), "custom on-site"
    else:
        assert q["I15"].value == "—"
    assert q["I16"].value == pytest.approx(sum(py.addon_prices.values()))
    if name != "team_price_outside_range":  # that warning comes from the team's typed price, not pricing.py
        assert (q["B3"].value != "No warnings") == bool(py.warnings), (q["B3"].value, py.warnings)


def test_no_formula_errors_on_any_tab(wbs):
    for name, wb in wbs.items():
        for ws in wb.worksheets:
            for row in ws.iter_rows():
                for c in row:
                    if isinstance(c.value, str) and c.value.startswith("#"):
                        # code-11 / invalid scenarios may show #VALUE in Breakdown math; prices stay "—"
                        assert ws.title == "Breakdown" and name in ("dirt_code_11", "photo_review_bumps_to_11",
                                                                    "missing_sqft", "missing_dirt_code"), \
                            (name, ws.title, c.coordinate, c.value)


def test_frequency_changes_recurring_time(wbs):
    q = wbs["phone_call_average_home"]["Quote"]
    assert q["L14"].value > q["L13"].value > q["L12"].value  # monthly > every 2 weeks > weekly


def test_minimums_flagged(wbs):
    q = wbs["tiny_clean_home_hits_minimums"]["Quote"]
    assert "(minimum)" in q["G9"].value and q["I9"].value == 450
    assert q["H9"].value == 450  # low end never goes below the minimum


def test_big_home_warnings(wbs):
    w = wbs["big_home_pets_photo_bump"]["Quote"]["B3"].value
    assert "walk-through" in w and "outside the service area" in w and "add the reason" in w


def test_quote_text(wbs):
    q = wbs["worked_example"]["Quote"]
    text = q["G19"].value
    assert text.startswith("Hi Jane,")
    assert "Deluxe Deep Clean: $985 (includes $50 off promo)" in text
    assert "Initial" not in text
    assert "Every 2 weeks: $240" in text
    assert "Lemon and Lavender Cleaning Co." in text and "&" not in text
    assert q["D30"].value.startswith("7 = ")  # dirt description shows the code actually used
    assert q["D7"].value == "Loaded ✓"


def test_todo_bar(wbs):
    done = wbs["worked_example"]["Quote"]["G4"].value
    assert "All orange fields filled in" in done, done
    todo = wbs["phone_call_average_home"]["Quote"]["G4"].value
    assert todo.startswith("✍ Still to type in: Living rooms, Kitchens, Bonus/basements, People, Dogs, Cats, Other animals, Last cleaning"), todo
    assert "filled in" in wbs["last_clean_never"]["Quote"]["G4"].value


def test_manual_rows_point_to_jobber(wbs):
    q = wbs["worked_example"]["Quote"]
    for cell in ("D18", "D19", "D20", "D21", "D22", "D24", "D25", "D26", "D39", "D40", "D41"):
        assert q[cell].value == "👉 Check Jobber request", cell


def test_team_price_used_and_flagged(wbs):
    q = wbs["team_price_outside_range"]["Quote"]
    assert "outside the suggested range" in q["B3"].value
    assert "Weekly: $999" in q["G19"].value
    assert q["M42"].value == 999  # Jobber line item uses the team's price


def test_line_items_match_quoted_price_after_promo(wbs):
    q = wbs["worked_example"]["Quote"]
    assert q["M40"].value + q["M48"].value == q["I8"].value  # Deluxe line - promo = price quoted


def test_dropdown_newest_first(wbs):
    lists = wbs["worked_example"]["Lists"]
    labels = [lists[f"A{r}"].value for r in range(2, 6)]
    assert labels[:3] == ["Jane Sample · 11/4/2026", "Deborah Field · 11/3/2026", "Jane Sample · 11/2/2026"], labels
    assert labels[3] in (None, "")
    # the default pick is the older Jane Sample request (row 2), and loads exactly that row
    q = wbs["worked_example"]["Quote"]
    assert q["D7"].value == "Loaded ✓"
    assert wbs["worked_example"]["Breakdown"][B.BD_REF["row_found"].split("!")[1].replace("$", "")].value == 2


def test_custom_quote_text_and_line_item(wbs):
    q = wbs["custom_only_basement"]["Quote"]
    assert "Ready to quote" in q["B2"].value
    text = q["G19"].value
    assert "Based on the areas you'd like cleaned" in text
    assert "CUSTOM CLEAN: Basement, Laundry room (deep cleaning)" in text
    assert "ONE-TIME CLEANS" not in text
    assert q["G49"].value == "Custom Clean (Basement, Laundry room)"
    assert q["M49"].value == q["I15"].value
    small = wbs["custom_recurring_small"]["Quote"]
    assert small["I15"].value == 110 and "(minimum)" in small["G15"].value  # weekly per-visit minimum
    assert "per visit" in small["G19"].value


def test_custom_missing_type_blocks(wbs):
    assert "Pick the type of clean" in wbs["custom_missing_type"]["Quote"]["B2"].value


def test_rooms_never_move_recommended_only_the_range(wbs):
    base = estimate(EstimateInput(sqft=1500, bedrooms=4, bathrooms=3, dirt_code=5, today=TODAY))
    more = estimate(EstimateInput(sqft=1500, bedrooms=4, bathrooms=3, dirt_code=5, living_rooms=2, kitchens=2,
                                  bonus_rooms=2, today=TODAY))
    for svc in base.services:
        assert more.services[svc].service_price == base.services[svc].service_price, svc
        assert more.services[svc].high >= base.services[svc].high, svc
    d = more.services["deluxe_deep"]
    assert d.high > base.services["deluxe_deep"].high  # extra rooms push the high end up
    q = wbs["rooms_hit_cap"]["Quote"]
    rec, high = q["I8"].value, q["J8"].value
    assert high <= rec * 1.30 + 5  # sq ft high (+15%) plus at most 15% more from rooms
    rt = wbs["extra_rooms"]["Room Times"]
    assert [rt[f"I{r}"].value for r in range(5, 16)] == [2, 3, 0, 1, 3, 2, 1, 1, 1, 1, 2]


def test_room_check_needs_beds_and_baths(wbs):
    bd = wbs["missing_beds"]["Breakdown"]
    assert bd[f"F{B.CALC['roomprice']}"].value == "n/a"
    assert bd[f"F{B.CALC['low']}"].value == bd[f"F{B.CALC['sqlow']}"].value
    assert bd[f"F{B.CALC['high']}"].value == bd[f"F{B.CALC['sqhigh']}"].value


def test_quote_only_lists_picked_services(wbs):
    q = wbs["only_deluxe_and_monthly"]["Quote"]
    text = q["G19"].value
    assert "Deluxe Deep Clean: $" in text and "Monthly: $" in text
    for gone in ("Move-In / Move-Out", "Weekly:", "Every 2 weeks:"):
        assert gone not in text, gone
    assert q["G40"].value == "Deluxe Deep Clean" and q["G44"].value == "Monthly Maintenance Clean"
    assert all(q[f"G{r}"].value in (None, "") for r in (41, 42, 43)), "unpicked line items stay blank"


def test_nothing_picked_prompts_team(wbs):
    q = wbs["nothing_picked"]["Quote"]
    assert q["G19"].value.startswith("👉 Pick what to quote")
    assert q["M8"].value == "No"
