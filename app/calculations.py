"""Financial calculations for machines and reporting.

All money in/out of this module is a Decimal number of dollars, quantized
to cents. Internally everything is summed as integer cents to avoid any
floating-point rounding error, then converted once at the end.
"""

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from app.models import CollectionEntry, CommissionPayment, MaintenanceExpense, RestockEntry

CENTS = Decimal("0.01")


def _to_dollars(cents: int) -> Decimal:
    return (Decimal(cents) / 100).quantize(CENTS, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class MachinePeriodSummary:
    machine_id: str
    period_start: date | None
    period_end: date | None
    cash_revenue: Decimal
    cashless_revenue: Decimal
    restock_cost: Decimal
    commission_paid: Decimal
    maintenance_cost: Decimal

    @property
    def total_revenue(self) -> Decimal:
        return self.cash_revenue + self.cashless_revenue

    @property
    def total_expenses(self) -> Decimal:
        return self.restock_cost + self.commission_paid + self.maintenance_cost

    @property
    def net_profit(self) -> Decimal:
        return self.total_revenue - self.total_expenses


def _in_range(d: date, start: date | None, end: date | None) -> bool:
    if start and d < start:
        return False
    if end and d > end:
        return False
    return True


def summarize_machine_period(
    machine_id: str,
    collections: list[CollectionEntry],
    restocks: list[RestockEntry],
    commissions: list[CommissionPayment],
    maintenance: list[MaintenanceExpense],
    period_start: date | None = None,
    period_end: date | None = None,
) -> MachinePeriodSummary:
    """Compute revenue/expense/profit totals for one machine over a period.

    Every list may contain entries for other machines or outside the
    period -- they're filtered here, so callers can pass full lists in.
    """
    cash_cents = sum(
        c.cash_collected_cents
        for c in collections
        if c.machine_id == machine_id and _in_range(c.collection_date, period_start, period_end)
    )
    cashless_cents = sum(
        c.cashless_collected_cents
        for c in collections
        if c.machine_id == machine_id and _in_range(c.collection_date, period_start, period_end)
    )
    restock_cents = sum(
        r.product_cost_cents
        for r in restocks
        if r.machine_id == machine_id and _in_range(r.restock_date, period_start, period_end)
    )
    commission_cents = sum(
        p.amount_cents
        for p in commissions
        if p.machine_id == machine_id and _in_range(p.payment_date, period_start, period_end)
    )
    maintenance_cents = sum(
        m.amount_cents
        for m in maintenance
        if m.machine_id == machine_id and _in_range(m.expense_date, period_start, period_end)
    )

    return MachinePeriodSummary(
        machine_id=machine_id,
        period_start=period_start,
        period_end=period_end,
        cash_revenue=_to_dollars(cash_cents),
        cashless_revenue=_to_dollars(cashless_cents),
        restock_cost=_to_dollars(restock_cents),
        commission_paid=_to_dollars(commission_cents),
        maintenance_cost=_to_dollars(maintenance_cents),
    )


def suggested_commission_cents(cash_and_cashless_cents: int, commission_rate_percent: Decimal) -> int:
    """Suggest a commission amount (in cents) from a machine's revenue and
    its configured commission rate. This is a suggestion only -- the app
    never auto-creates a CommissionPayment, it just pre-fills the form,
    since real-world commission deals often have exceptions.
    """
    if commission_rate_percent <= 0 or cash_and_cashless_cents <= 0:
        return 0
    raw = Decimal(cash_and_cashless_cents) * (commission_rate_percent / Decimal(100))
    return int(raw.to_integral_value(rounding=ROUND_HALF_UP))
