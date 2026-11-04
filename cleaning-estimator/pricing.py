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

SERVICES = ["monthly", "biweekly", "weekly", "deluxe_deep", "move"]

SERVICE_LABELS = {
    "monthly": "Monthly Maintenance",
    "biweekly": "Bi-Weekly Maintenance",
    "weekly": "Weekly Maintenance",
    "deluxe_deep": "Deluxe Deep Clean",
    "move": "Move-In / Move-Out Clean",
}

DEFAULT_SETTINGS: dict = {
    # Per-service parameters (order matches SERVICES).
    "production_rate": [650, 775, 850, 300, 275],  # rate card
    "scope_multiplier": [1, 1, 1, 1.25, 1],  # Deluxe = +25% (assumption)
    "billable_rate": [80, 80, 80, 90, 90],  # Andrew, Nov 2026
    "minimum_price": [150, 110, 110, 400, 450],  # rate card methodology list
    "extra_bath_hours": [0.25, 0.25, 0.25, 0.5, 0.5],
    "dirt_sensitivity": [0.5, 0.5, 0.5, 1, 1],
    "household_factors_apply": [1, 1, 1, 1, 0],  # move = empty home
    "last_clean_applies": [0, 0, 0, 1, 1],
    "one_time": [0, 0, 0, 1, 1],
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
    # Room check (Room-by-Room Cleaning Timeframe Sheet). Rooms never change Recommended;
    # they can stretch Low / High by up to these extra % of Recommended (Andrew Nov 2026: 15% each way).
    "range_stretch_low": 0.15, "range_stretch_high": 0.15,
    # Counts used when a field is blank.
    "living_included": 1, "kitchens_included": 1, "bonus_included": 0,
    "dining_count": 1, "laundry_count": 1, "hall_count": 1, "entry_count": 1,
    "room_low_end_max_dirt": 5,   # dirt 1-5 = low end of each room's time, 6+ = high end
    "room_dirt_extra_hours": {8: 1.0, 9: 1.5, 10: 2.0},  # guide: dirt 8-10 = high end + an hour or two
    "room_freq_extra_hours": [1.0, 0.5, 0, 0, 0],  # guide: +1 hr monthly, +30 min biweekly (order = SERVICES)
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


# Room-by-Room Cleaning Timeframe Sheet (minutes per technician): (key, room, deluxe lo, hi, move lo, hi,
# maintenance lo, hi, notes). Mirrors the Room Times tab; update both when the guide changes.
ROOM_TIMES = [
    ("kitchen", "Kitchen", 65, 90, 90, 120, 30, 40,
     "Move-in/out adds inside fridge, oven, microwave, cabinets and drawers. Add 15–20 min if the oven is heavily "
     "soiled or self-clean isn't an option."),
    ("full_bath", "Full Bathroom", 50, 70, 60, 75, 20, 35,
     "Add 10–15 min for heavy hard-water buildup on glass doors. Double-vanity or jetted-tub baths run high end."),
    ("half_bath", "Half Bath / Powder Room", 15, 20, 30, 40, 8, 12,
     "No shower/tub. Move-in/out adds inside vanity cabinet."),
    ("primary", "Primary / Master Bedroom", 30, 40, 30, 40, 10, 15, "Walk-in closets add 5–10 min."),
    ("guest", "Secondary / Guest Bedroom", 20, 25, 20, 30, 8, 10, "Kids' rooms with toys/clutter run high end."),
    ("living", "Living Room / Family Room", 45, 65, 30, 45, 15, 20, "Add time for pet hair on upholstery."),
    ("dining", "Dining Room", 25, 35, 20, 30, 8, 12, "Light fixtures/chandeliers add 5–10 min."),
    ("laundry", "Laundry Room", 20, 25, 20, 30, 5, 10, "Move-in/out adds inside cabinets and washer/dryer wipe."),
    ("hall", "Hallways & Stairs", 20, 30, 25, 35, 8, 12, "Count each full flight of stairs separately."),
    ("entry", "Entryway / Foyer", 10, 15, 10, 15, 3, 5, "Oct–Apr adds a few minutes for mud/debris."),
    ("bonus", "Home Office / Bonus Room / Basement", 20, 25, 20, 30, 8, 12,
     "Bonus rooms with play/gym equipment run high end. Basements use these times until the guide lists them."),
]
ROOM_COLS = {3: (2, 3), 4: (4, 5)}  # service index -> (lo, hi) position in a ROOM_TIMES row; others = maintenance


def room_counts(inp: "EstimateInput", s: dict = DEFAULT_SETTINGS) -> dict | None:
    """How many of each room the room check counts. None when beds or baths are missing."""
    if inp.bedrooms is None or inp.bathrooms is None:
        return None
    b = inp.bathrooms
    pick = lambda v, k: s[k] if v is None else v  # noqa: E731
    return {"kitchen": pick(inp.kitchens, "kitchens_included"), "full_bath": math.floor(b),
            "half_bath": 1 if b - math.floor(b) >= 0.5 else 0, "primary": 1 if inp.bedrooms >= 1 else 0,
            "guest": max(0, inp.bedrooms - 1), "living": pick(inp.living_rooms, "living_included"),
            "dining": s["dining_count"], "laundry": s["laundry_count"], "hall": s["hall_count"],
            "entry": s["entry_count"], "bonus": pick(inp.bonus_rooms, "bonus_included")}


def room_check_hours(i: int, counts: dict, dirt: int, s: dict = DEFAULT_SETTINGS) -> float:
    """Labor hours from the room-by-room guide for service index i."""
    if i in ROOM_COLS:
        lo, hi = ROOM_COLS[i]
        col = lo if dirt <= s["room_low_end_max_dirt"] else hi
        minutes = sum(counts[r[0]] * r[col] for r in ROOM_TIMES)
        extra = max([h for d, h in s["room_dirt_extra_hours"].items() if dirt >= d], default=0)
    else:
        minutes = sum(counts[r[0]] * (r[6] + r[7]) / 2 for r in ROOM_TIMES)
        extra = 0
    return ceil_to(minutes / 60 + extra + s["room_freq_extra_hours"][i], s["hours_rounding"])


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
    promo_off_deluxe: float = 0.0
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
CUSTOM_TYPES = {"Monthly": 0, "Bi-weekly": 1, "Weekly": 2, "Deep": 3, "Move-out": 4}


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
    counts = room_counts(inp, s)
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
        hours = ceil_to((base + bath_h) * s["scope_multiplier"][i] * dirt_f * occ_f * pet_f * lc_f,
                        s["hours_rounding"])
        price = ceil_to(hours * s["billable_rate"][i] * (1 + inp.photo_adjust_pct), s["price_rounding"])
        minimum = max(s["minimum_price"][i], s["trip_minimum_one_time"] if s["one_time"][i] else 0)
        service_price = max(price, minimum)
        promo = -inp.promo_off_deluxe if svc == "deluxe_deep" else 0
        low = max(minimum, floor_to(service_price * (1 - s["range_low_pct"]), s["price_rounding"]))
        high = ceil_to(service_price * (1 + s["range_high_pct"]), s["price_rounding"])
        if counts is not None:  # room check stretches the range, capped; Recommended never moves
            room_price = ceil_to(room_check_hours(i, counts, dirt, s) * s["billable_rate"][i]
                                 * (1 + inp.photo_adjust_pct), s["price_rounding"])
            low_cap = floor_to(service_price * (1 - s["range_low_pct"] - s["range_stretch_low"]), s["price_rounding"])
            high_cap = ceil_to(service_price * (1 + s["range_high_pct"] + s["range_stretch_high"]), s["price_rounding"])
            low = max(minimum, min(low, max(room_price, low_cap)))
            high = max(high, min(room_price, high_cap))
        out[svc] = ServiceEstimate(svc, hours, hours / s["team_size"], service_price,
                                   minimum > price, low, high, promo, addons_total,
                                   service_price + promo + addons_total)
    return Estimate("ready", errors, warnings, out, addon_prices, custom)
