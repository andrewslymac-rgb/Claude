"""Cross-check: Sheet formulas (recalculated by LibreOffice) == pricing.py.

    cd cleaning-estimator && python3 -m pytest -q test_estimator.py

Needs LibreOffice (`soffice`) on PATH; skips otherwise.
"""

from __future__ import annotations

import shutil
import subprocess
from datetime import date, timedelta

import pytest
from openpyxl import load_workbook

import build_estimator as B
from pricing import EstimateInput, estimate

pytestmark = pytest.mark.skipif(shutil.which("soffice") is None, reason="LibreOffice not installed")

TODAY = date.today()
# Quote-tab price row -> (service key, Breakdown column)
PANEL = {8: ("initial_deep", "F"), 9: ("deluxe_deep", "G"), 10: ("move", "H"),
         12: ("weekly", "E"), 13: ("biweekly", "D"), 14: ("monthly", "C")}

CLEAR = {k: None for k in ["pick", "sqft", "beds", "baths", "people", "dogs", "cats", "other", "last_clean",
                           "dirt", "photo_dirt", "photo_pct", "photo_why", "windows", "promo"]}
CLEAR.update({"fridge": "No", "oven": "No"})

SCENARIOS = {
    "worked_example": (
        {},
        EstimateInput(sqft=1850, bedrooms=3, bathrooms=2.5, dirt_code=6, photo_dirt_code=7,
                      photo_reason="x", occupants=4, dogs=1, cats=1, last_pro_clean=date(2026, 3, 1),
                      fridge=True, windows=12, promo_off_initial_deep=50, city="Milwaukie", today=TODAY),
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
                      other_animals=1, photo_adjust_pct=0.1, oven=True, promo_off_initial_deep=25,
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
         "other": 0, "last_clean": "never"},
        EstimateInput(sqft=1800, bedrooms=3, bathrooms=2, dirt_code=5, occupants=2, today=TODAY),
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


@pytest.fixture(scope="module")
def wbs(tmp_path_factory):
    src = tmp_path_factory.mktemp("src")
    out = tmp_path_factory.mktemp("out")
    paths = []
    for name, (answers, _) in SCENARIOS.items():
        p = src / f"{name}.xlsx"
        B.build(p, answers=answers)
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
        assert all(q[f"H{r}"].value == "—" for r in PANEL)
        assert "not able to take on this cleaning" in q["G19"].value
        return
    if py.status == "invalid":
        assert status.startswith("⚠")
        for e in py.errors:  # same message, word for word
            assert e.split(" ")[0] in status
        assert all(q[f"H{r}"].value == "—" for r in PANEL)
        return
    assert "Ready to quote" in status, status
    for r, (svc, col) in PANEL.items():
        se = py.services[svc]
        assert q[f"H{r}"].value == pytest.approx(se.service_price + se.promo), (svc, "price")
        assert bd[f"{col}{B.CALC['hours']}"].value == pytest.approx(se.labor_hours), (svc, "hours")
        assert q[f"I{r}"].value == pytest.approx(se.onsite_hours), (svc, "on-site")
    assert q["H15"].value == pytest.approx(sum(py.addon_prices.values()))
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
    assert q["I14"].value > q["I13"].value > q["I12"].value  # monthly > every 2 weeks > weekly


def test_minimums_flagged(wbs):
    q = wbs["tiny_clean_home_hits_minimums"]["Quote"]
    assert "(minimum)" in q["G10"].value and q["H10"].value == 450


def test_big_home_warnings(wbs):
    w = wbs["big_home_pets_photo_bump"]["Quote"]["B3"].value
    assert "walk-through" in w and "outside the service area" in w and "add the reason" in w


def test_quote_text(wbs):
    q = wbs["worked_example"]["Quote"]
    text = q["G19"].value
    assert text.startswith("Hi Jane,")
    assert "Initial Deep Clean: $785 (includes $50 off promo)" in text
    assert "Every 2 weeks: $240" in text
    assert "Lemon and Lavender Cleaning Co." in text and "&" not in text
    assert q["D27"].value.startswith("7 = ")  # dirt description shows the code actually used
    assert q["D7"].value == "Loaded ✓"


def test_todo_bar(wbs):
    done = wbs["worked_example"]["Quote"]["G4"].value
    assert "All orange fields filled in" in done, done
    todo = wbs["phone_call_average_home"]["Quote"]["G4"].value
    assert todo.startswith("✍ Still to type in: People, Dogs, Cats, Other animals, Last cleaning"), todo
    assert "filled in" in wbs["last_clean_never"]["Quote"]["G4"].value


def test_manual_rows_point_to_jobber(wbs):
    q = wbs["worked_example"]["Quote"]
    for cell in ("D18", "D19", "D20", "D21", "D22", "D36", "D37", "D38"):
        assert q[cell].value == "👉 Check Jobber request", cell
