"""Small shared form-parsing helpers used across the entry-logging routes."""

from datetime import date, datetime
from decimal import Decimal, InvalidOperation


class FormValidationError(ValueError):
    pass


def parse_money_to_cents(value: str, field_label: str, allow_zero: bool = True) -> int:
    value = (value or "").strip()
    if not value:
        raise FormValidationError(f"{field_label} is required.")
    try:
        dollars = Decimal(value)
    except InvalidOperation as exc:
        raise FormValidationError(f"{field_label} must be a number.") from exc
    if dollars < 0:
        raise FormValidationError(f"{field_label} can't be negative.")
    if not allow_zero and dollars == 0:
        raise FormValidationError(f"{field_label} must be greater than zero.")
    return int((dollars * 100).to_integral_value(rounding="ROUND_HALF_UP"))


def parse_entry_date(value: str, field_label: str = "Date", allow_future: bool = False) -> date:
    value = (value or "").strip()
    if not value:
        raise FormValidationError(f"{field_label} is required.")
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise FormValidationError(f"{field_label} must be a valid date.") from exc
    if not allow_future and parsed > date.today():
        raise FormValidationError(f"{field_label} can't be in the future.")
    return parsed
