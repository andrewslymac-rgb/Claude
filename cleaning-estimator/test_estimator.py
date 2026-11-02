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
# panel row -> service key
PANEL = {6: "initial_deep", 7: "deluxe_deep", 8: "move", 9: "weekly", 10: "biweekly", 11: "monthly"}

CLEAR = {k: None for k in ["D4", "D14", "D15", "D16", "D17", "D18", "D19", "D20", "D21", "D23",
                           "D25", "D26", "D27", "D32", "D33"]}
CLEAR.update({"D30": "No", "D31": "No"})

SCENARIOS = {
    # Worked example as shipped (sample Meta request + team entries).
    "worked_example": (
        {},
        EstimateInput(sqft=1850, bedrooms=3, bathrooms=2.5, dirt_code=6, photo_dirt_code=7,
                      photo_reason="x", occupants=4, dogs=1, cats=1, last_pro_clean=date(2026, 3, 1),
                      fridge=True, windows=12, promo_off_initial_deep=50, city="Milwaukie", today=TODAY),
    ),
    "phone_call_average_home": (
        {**CLEAR, "D8": "Gresham", "D14": 2400, "D15": 4, "D16": 3, "D23": 5},
        EstimateInput(sqft=2400, bedrooms=4, bathrooms=3, dirt_code=5, city="Gresham", today=TODAY),
    ),
    "tiny_clean_home_hits_minimums": (
        {**CLEAR, "D14": 600, "D15": 1, "D16": 1, "D23": 1, "D17": 1,
         "D21": TODAY - timedelta(days=10)},
        EstimateInput(sqft=600, bedrooms=1, bathrooms=1, dirt_code=1, occupants=1,
                      last_pro_clean=TODAY - timedelta(days=10), today=TODAY),
    ),
    "big_home_pets_photo_bump": (
        {**CLEAR, "D8": "Beaverton", "D14": 4500, "D15": 5, "D16": 4.5, "D23": 8, "D17": 6,
         "D18": 3, "D19": 2, "D20": 1, "D26": 0.1, "D31": "Yes", "D33": 25},
        EstimateInput(sqft=4500, bedrooms=5, bathrooms=4.5, dirt_code=8, occupants=6, dogs=3, cats=2,
                      other_animals=1, photo_adjust_pct=0.1, oven=True, promo_off_initial_deep=25,
                      city="Beaverton", today=TODAY),
    ),
    "dirt_code_11": (
        {**CLEAR, "D14": 1500, "D15": 2, "D16": 1, "D23": 11},
        EstimateInput(sqft=1500, bedrooms=2, bathrooms=1, dirt_code=11, today=TODAY),
    ),
    "photo_review_bumps_to_11": (
        {**CLEAR, "D14": 1500, "D15": 2, "D16": 1, "D23": 7, "D25": 11, "D27": "Hoarding in photos"},
        EstimateInput(sqft=1500, bedrooms=2, bathrooms=1, dirt_code=7, photo_dirt_code=11,
                      photo_reason="y", today=TODAY),
    ),
    "missing_sqft": (
        {**CLEAR, "D23": 5},
        EstimateInput(sqft=None, dirt_code=5, today=TODAY),
    ),
}


@pytest.fixture(scope="module")
def recalculated(tmp_path_factory):
    src = tmp_path_factory.mktemp("src")
    out = tmp_path_factory.mktemp("out")
    paths = []
    for name, (overrides, _) in SCENARIOS.items():
        p = src / f"{name}.xlsx"
        B.build(p, overrides=overrides)
        paths.append(str(p))
    subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", str(out), *paths],
                   check=True, capture_output=True, timeout=300)
    return {name: load_workbook(out / f"{name}.xlsx", data_only=True)["Estimator"] for name in SCENARIOS}


@pytest.mark.parametrize("name", list(SCENARIOS))
def test_sheet_matches_python(recalculated, name):
    ws = recalculated[name]
    py = estimate(SCENARIOS[name][1])
    status = ws["C35"].value
    if py.status == "do_not_service":
        assert "DO NOT SERVICE" in status
        assert all(ws[f"I{r}"].value == "—" for r in PANEL)
        assert "not able to take on this cleaning" in ws["H15"].value
        return
    if py.status == "invalid":
        assert status.startswith("⚠")
        assert all(ws[f"I{r}"].value == "—" for r in PANEL)
        return
    assert status.startswith("✅"), status
    for r, svc in PANEL.items():
        se = py.services[svc]
        assert ws[f"I{r}"].value == pytest.approx(se.service_price + se.promo), (svc, "price")
        assert ws[f"J{r}"].value == pytest.approx(se.labor_hours), (svc, "hours")
    assert ws["I12"].value == pytest.approx(sum(py.addon_prices.values()))
    # warnings agree on presence
    assert (ws["C36"].value != "None") == bool(py.warnings), (ws["C36"].value, py.warnings)


def test_frequency_changes_recurring_time(recalculated):
    ws = recalculated["phone_call_average_home"]
    monthly, biweekly, weekly = ws["J11"].value, ws["J10"].value, ws["J9"].value
    assert monthly > biweekly > weekly


def test_minimums_flagged(recalculated):
    ws = recalculated["tiny_clean_home_hits_minimums"]
    assert "(minimum)" in ws["H8"].value  # Move-In/Out floor $450
    assert ws["I8"].value == 450


def test_big_home_warnings(recalculated):
    w = recalculated["big_home_pets_photo_bump"]["C36"].value
    assert "walk-through" in w and "outside the service area" in w and "add a reason" in w


def test_quote_text_lists_selected_services(recalculated):
    text = recalculated["worked_example"]["H15"].value
    assert text.startswith("Hi Jane,")
    assert "Initial Deep Clean: $" in text and "Every 2 weeks: $" in text
    assert "includes $50 off promo" in text
    assert "&" not in text.split("\n")[2]  # company name written in full
