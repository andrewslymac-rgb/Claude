from datetime import date
from decimal import Decimal

from app.calculations import summarize_machine_period, suggested_commission_cents
from app.models import CollectionEntry, CommissionPayment, MaintenanceExpense, RestockEntry


def _collection(machine_id, d, cash=0, cashless=0):
    return CollectionEntry(
        machine_id=machine_id, collection_date=d, cash_collected_cents=cash, cashless_collected_cents=cashless
    )


def _restock(machine_id, d, cost):
    return RestockEntry(machine_id=machine_id, restock_date=d, product_cost_cents=cost)


def _commission(machine_id, d, amount):
    return CommissionPayment(machine_id=machine_id, payment_date=d, amount_cents=amount)


def _maintenance(machine_id, d, amount):
    return MaintenanceExpense(machine_id=machine_id, expense_date=d, amount_cents=amount)


def test_summarize_machine_period_computes_correct_profit():
    collections = [_collection("m1", date(2026, 1, 5), cash=10000, cashless=5000)]
    restocks = [_restock("m1", date(2026, 1, 4), 3000)]
    commissions = [_commission("m1", date(2026, 1, 6), 1500)]
    maintenance = [_maintenance("m1", date(2026, 1, 3), 500)]

    summary = summarize_machine_period(
        "m1", collections, restocks, commissions, maintenance,
        period_start=date(2026, 1, 1), period_end=date(2026, 1, 31),
    )

    assert summary.cash_revenue == Decimal("100.00")
    assert summary.cashless_revenue == Decimal("50.00")
    assert summary.total_revenue == Decimal("150.00")
    assert summary.restock_cost == Decimal("30.00")
    assert summary.commission_paid == Decimal("15.00")
    assert summary.maintenance_cost == Decimal("5.00")
    assert summary.total_expenses == Decimal("50.00")
    assert summary.net_profit == Decimal("100.00")


def test_summarize_machine_period_excludes_other_machines():
    collections = [
        _collection("m1", date(2026, 1, 5), cash=10000),
        _collection("m2", date(2026, 1, 5), cash=99999),
    ]
    summary = summarize_machine_period("m1", collections, [], [], [])
    assert summary.total_revenue == Decimal("100.00")


def test_summarize_machine_period_excludes_entries_outside_range():
    collections = [
        _collection("m1", date(2026, 1, 1), cash=10000),  # before range
        _collection("m1", date(2026, 2, 15), cash=5000),  # in range
        _collection("m1", date(2026, 3, 1), cash=20000),  # after range
    ]
    summary = summarize_machine_period(
        "m1", collections, [], [], [], period_start=date(2026, 2, 1), period_end=date(2026, 2, 28)
    )
    assert summary.total_revenue == Decimal("50.00")


def test_summarize_machine_period_with_no_entries_is_zero():
    summary = summarize_machine_period("m1", [], [], [], [])
    assert summary.total_revenue == Decimal("0.00")
    assert summary.net_profit == Decimal("0.00")


def test_net_profit_can_go_negative():
    collections = [_collection("m1", date(2026, 1, 1), cash=1000)]
    restocks = [_restock("m1", date(2026, 1, 1), 5000)]
    summary = summarize_machine_period("m1", collections, restocks, [], [])
    assert summary.net_profit == Decimal("-40.00")


def test_suggested_commission_cents_applies_rate():
    # $150.00 in revenue at 10% commission -> $15.00
    assert suggested_commission_cents(15000, Decimal("10")) == 1500


def test_suggested_commission_cents_rounds_half_up():
    # $10.005 -> rounds to $10.01 at 50% of a $20.01 collection... use a
    # case that lands exactly on a half-cent: 33 cents at 50% = 16.5 cents.
    assert suggested_commission_cents(33, Decimal("50")) == 17


def test_suggested_commission_cents_zero_rate_or_revenue():
    assert suggested_commission_cents(0, Decimal("10")) == 0
    assert suggested_commission_cents(10000, Decimal("0")) == 0
    assert suggested_commission_cents(10000, Decimal("-5")) == 0
