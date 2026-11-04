"""Lemon and Lavender Cleaning Co. -- residential estimate engine.

This is the reference implementation of the pricing logic used in the
Google Sheet estimator. The Sheet formulas and this module must agree;
tests/test_cleaning_estimator.py rebuilds the workbook, recalculates it with
LibreOffice, and compares the two. If the team later moves to a web app,
this module is the engine to reuse -- the Sheet's Settings tab maps 1:1 to
DEFAULT_SETTINGS below.

Method (from "1 NEW L&L Rate Card Residential ONLY"):
    Hours = Sq Ft / production rate (sq ft per labor hour, per service)
    Price = Hours x billable rate, rounded UP to the nearest $5,
            floored at the service minimum.
Extensions (assumptions -- all editable in Settings):
    + extra-bathroom time, scope multiplier (Deluxe), dirt code,
      occupants, pets, time since last professional clean,
      photo-review adjustment, add-ons, promo discount.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date

SERVICES = ["monthly", "biweekly", "weekly", "initial_deep", "deluxe_deep", "move"]

SERVICE_LABELS = {
    "monthly": "Monthly Maintenance",
    "biweekly": "Bi-Weekly Maintenance",
    "weekly": "Weekly Maintenance",
    "initial_deep": "Initial Deep Clean",
    "deluxe_deep": "Deluxe Deep Clean",
    "move": "Move-In / Move-Out Clean",
}

DEFAULT_SETTINGS: dict = {
    # Per-service parameters (order matches SERVICES).
    "production_rate": [650, 775, 850, 300, 300, 275],  # rate card
    "scope_multiplier": [1, 1, 1, 1, 1.25, 1],  # Deluxe = +25% (assumption)
    "billable_rate": [80, 80, 80, 90, 90, 90],  # Andrew, Nov 2026
    "minimum_price": [150, 110, 110, 400, 400, 450],  # rate card methodology list
    "extra_bath_hours": [0.25, 0.25, 0.25, 0.5, 0.5, 0.5],
    "dirt_sensitivity": [0.5, 0.5, 0.5, 1, 1, 1],
    "household_factors_apply": [1, 1, 1, 1, 1, 0],  # move = empty home
    "last_clean_applies": [0, 0, 0, 1, 1, 1],
    "one_time": [0, 0, 0, 1, 1, 1],
    # General.
    "trip_minimum_one_time": 250,
    "custom_minimum_one_time": 250,  # custom / partial-home one-time jobs
    "range_low_pct": 0.10,   # Low = Recommended - 10%, never below the minimum
    "range_high_pct": 0.15,  # High = Recommended + 15%
    "hours_rounding": 0.25,
    "price_rounding": 5,
    "sqft_per_included_bath": 750,
    "team_size": 2,
    "occupants_included": 2,
    "per_extra_occupant": 0.03,
    "occupant_cap": 0.15,
    "per_dog": 0.03,
    "per_cat": 0.02,
    "per_other_animal": 0.01,
    "pet_cap": 0.20,
    # Rooms: a small % per room beyond what the base assumes (Andrew Nov 2026: 3% each).
    "living_included": 1, "per_extra_living": 0.03,
    "kitchens_included": 1, "per_extra_kitchen": 0.03,
    "bonus_included": 0, "per_extra_bonus": 0.03,
    "room_cap": 0.15,
    "walkthrough_sqft": 4000,
    "min_sqft": 300,
    "max_sqft": 10000,
    "months_if_unknown": 24,
    "addon_rate": 90,
    "fridge_hours": 0.75,
    "oven_hours": 1.0,
    "window_hours_each": 0.10,
    # Dirt code -> hours multiplier (code 11 = we do not service).
    "dirt_multiplier": {1: 0.90, 2: 0.93, 3: 0.96, 4: 0.98, 5: 1.00,
                        6: 1.08, 7: 1.16, 8: 1.24, 9: 1.32, 10: 1.40},
    # Months since last professional clean: (at least N months, factor).
    "last_clean_bands": [(0, 1.00), (1, 1.05), (3, 1.10), (6, 1.15), (12, 1.20)],
    "service_area": ["Portland", "Happy Valley", "Oregon City", "Milwaukie",
                     "Clackamas", "Lake Oswego", "West Linn", "Gresham"],
}


def floor_to(x: float, step: float) -> float:
    return math.floor(round(x / step, 9)) * step


def ceil_to(x: float, step: float) -> float:
    """Spreadsheet CEILING(x, step) for x >= 0, robust to float noise."""
    if x <= 0:
        return 0
    return math.ceil(round(x / step, 9)) * step


@dataclass
class EstimateInput:
    sqft: float | None
    bedrooms: float | None = None
    bathrooms: float | None = None
    dirt_code: int | None = None
    photo_dirt_code: int | None = None  # overrides dirt_code when set
    photo_adjust_pct: float = 0.0  # e.g. 0.10 = +10%
    photo_reason: str = ""
    occupants: int | None = None
    living_rooms: int | None = None  # None = the included count
    kitchens: int | None = None
    bonus_rooms: int | None = None  # bonus rooms + basements
    dogs: int = 0
    cats: int = 0
    other_animals: int = 0
    last_pro_clean: date | None = None
    fridge: bool = False
    oven: bool = False
    windows: int = 0
    promo_off_initial_deep: float = 0.0
    city: str = ""
    # Custom / partial-home quote: one type of clean, areas as (sq ft, extra hours).
    custom_type: str | None = None  # "Deep" | "Move-out" | "Weekly" | "Bi-weekly" | "Monthly"
    custom_areas: list = field(default_factory=list)
    today: date = field(default_factory=date.today)


@dataclass
class ServiceEstimate:
    service: str
    labor_hours: float
    onsite_hours: float
    service_price: float
    minimum_applied: bool
    low: float
    high: float
    promo: float
    addons: float
    total: float


@dataclass
class Estimate:
    status: str  # "ready" | "do_not_service" | "invalid"
    errors: list[str]
    warnings: list[str]
    services: dict[str, ServiceEstimate]
    addon_prices: dict[str, float]
    custom: ServiceEstimate | None = None


# Custom quote type -> index into SERVICES
CUSTOM_TYPES = {"Monthly": 0, "Bi-weekly": 1, "Weekly": 2, "Deep": 3, "Move-out": 5}


def _has_custom(inp: "EstimateInput") -> bool:
    return sum((a or 0) + (h or 0) for a, h in inp.custom_areas) > 0


def validate(inp: EstimateInput, s: dict = DEFAULT_SETTINGS) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    dirt = inp.photo_dirt_code if inp.photo_dirt_code is not None else inp.dirt_code
    if inp.sqft is None:
        if not _has_custom(inp):
            errors.append("Square footage is required.")
    elif not (s["min_sqft"] <= inp.sqft <= s["max_sqft"]):
        errors.append(f"Square footage must be {s['min_sqft']:,}-{s['max_sqft']:,}.")
    if dirt is None:
        errors.append("Dirt code is required.")
    elif dirt not in range(1, 12):
        errors.append("Dirt code must be a whole number 1-11.")
    if _has_custom(inp) and inp.custom_type not in CUSTOM_TYPES:
        errors.append("Pick the type of clean for the custom areas.")
    if min(inp.dogs, inp.cats, inp.other_animals) < 0 or (inp.occupants is not None and inp.occupants < 1):
        errors.append("People and animal counts can't be negative (at least 1 person).")
    if inp.sqft and inp.sqft > s["walkthrough_sqft"]:
        warnings.append("Over 4,000 sq ft: walk-through required before final price.")
    if inp.city and inp.city.strip().lower() not in [c.lower() for c in s["service_area"]]:
        warnings.append("City is outside the listed service area -- confirm before quoting.")
    if (inp.photo_dirt_code is not None or inp.photo_adjust_pct) and not inp.photo_reason.strip():
        warnings.append("Photo review changed the price -- add a reason.")
    if inp.bedrooms is None or inp.bathrooms is None:
        warnings.append("Beds/baths missing.")
    return errors, warnings


def estimate(inp: EstimateInput, s: dict = DEFAULT_SETTINGS) -> Estimate:
    errors, warnings = validate(inp, s)
    dirt = inp.photo_dirt_code if inp.photo_dirt_code is not None else inp.dirt_code
    if dirt == 11:
        return Estimate("do_not_service", errors, warnings, {}, {})
    if errors:
        return Estimate("invalid", errors, warnings, {}, {})

    sqft = inp.sqft or 0
    baths = inp.bathrooms or 0
    occupants = inp.occupants if inp.occupants is not None else s["occupants_included"]
    if inp.last_pro_clean is None:
        months = s["months_if_unknown"]
    else:
        months = max(0, (inp.today - inp.last_pro_clean).days / 30.4375)
    last_factor = [f for m, f in s["last_clean_bands"] if months >= m][-1]
    occ_add = min(s["occupant_cap"], max(0, occupants - s["occupants_included"]) * s["per_extra_occupant"])
    pet_add = min(s["pet_cap"], inp.dogs * s["per_dog"] + inp.cats * s["per_cat"]
                  + inp.other_animals * s["per_other_animal"])
    living = s["living_included"] if inp.living_rooms is None else inp.living_rooms
    kitchens = s["kitchens_included"] if inp.kitchens is None else inp.kitchens
    bonus = s["bonus_included"] if inp.bonus_rooms is None else inp.bonus_rooms
    room_add = min(s["room_cap"], max(0, living - s["living_included"]) * s["per_extra_living"]
                   + max(0, kitchens - s["kitchens_included"]) * s["per_extra_kitchen"]
                   + max(0, bonus - s["bonus_included"]) * s["per_extra_bonus"])
    extra_baths = max(0, baths - sqft / s["sqft_per_included_bath"]) if sqft else 0

    addon_prices = {
        "fridge": ceil_to((s["fridge_hours"] if inp.fridge else 0) * s["addon_rate"], s["price_rounding"]),
        "oven": ceil_to((s["oven_hours"] if inp.oven else 0) * s["addon_rate"], s["price_rounding"]),
        "windows": ceil_to(inp.windows * s["window_hours_each"] * s["addon_rate"], s["price_rounding"]),
    }
    addons_total = sum(addon_prices.values())

    def factors(i: int) -> float:
        dirt_f = 1 + (s["dirt_multiplier"][dirt] - 1) * s["dirt_sensitivity"][i]
        hh = s["household_factors_apply"][i]
        lc_f = last_factor if s["last_clean_applies"][i] else 1
        return dirt_f * (1 + hh * occ_add) * (1 + hh * pet_add) * lc_f

    def priced(svc: str, i: int, hours: float, minimum: float, promo: float) -> ServiceEstimate:
        price = ceil_to(hours * s["billable_rate"][i] * (1 + inp.photo_adjust_pct), s["price_rounding"])
        service_price = max(price, minimum)
        low = max(minimum, floor_to(service_price * (1 - s["range_low_pct"]), s["price_rounding"]))
        high = ceil_to(service_price * (1 + s["range_high_pct"]), s["price_rounding"])
        return ServiceEstimate(svc, hours, hours / s["team_size"], service_price, minimum > price, low, high,
                               promo, addons_total, service_price + promo + addons_total)

    custom = None
    if _has_custom(inp):
        i = CUSTOM_TYPES[inp.custom_type]
        area_sqft = sum(a or 0 for a, _ in inp.custom_areas)
        extra = sum(h or 0 for _, h in inp.custom_areas)
        hours = ceil_to((area_sqft / s["production_rate"][i] + extra) * factors(i), s["hours_rounding"])
        minimum = s["custom_minimum_one_time"] if s["one_time"][i] else s["minimum_price"][i]
        custom = priced("custom", i, hours, minimum, 0)

    out = {}
    if not inp.sqft:
        return Estimate("ready", errors, warnings, out, addon_prices, custom)
    for i, svc in enumerate(SERVICES):
        base = sqft / s["production_rate"][i]
        bath_h = extra_baths * s["extra_bath_hours"][i]
        dirt_f = 1 + (s["dirt_multiplier"][dirt] - 1) * s["dirt_sensitivity"][i]
        hh = s["household_factors_apply"][i]
        occ_f = 1 + hh * occ_add
        pet_f = 1 + hh * pet_add
        lc_f = last_factor if s["last_clean_applies"][i] else 1
        hours = ceil_to((base + bath_h) * s["scope_multiplier"][i] * dirt_f * occ_f * pet_f * (1 + room_add) * lc_f,
                        s["hours_rounding"])
        price = ceil_to(hours * s["billable_rate"][i] * (1 + inp.photo_adjust_pct), s["price_rounding"])
        minimum = max(s["minimum_price"][i], s["trip_minimum_one_time"] if s["one_time"][i] else 0)
        service_price = max(price, minimum)
        promo = -inp.promo_off_initial_deep if svc == "initial_deep" else 0
        low = max(minimum, floor_to(service_price * (1 - s["range_low_pct"]), s["price_rounding"]))
        high = ceil_to(service_price * (1 + s["range_high_pct"]), s["price_rounding"])
        out[svc] = ServiceEstimate(svc, hours, hours / s["team_size"], service_price,
                                   minimum > price, low, high, promo, addons_total,
                                   service_price + promo + addons_total)
    return Estimate("ready", errors, warnings, out, addon_prices, custom)
