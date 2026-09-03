from datetime import date

import pytest

from app.models import CollectionEntry, CommissionPayment, MaintenanceExpense, RestockEntry
from app.qbo import mapping


def test_build_sales_receipt_has_one_line_per_tender_type(machine, complete_qbo_settings):
    entry = CollectionEntry(
        id="col-1", machine_id=machine.id, collection_date=date(2026, 1, 15),
        cash_collected_cents=10050, cashless_collected_cents=2500, notes="Route A",
    )

    payload = mapping.build_sales_receipt(entry, machine, complete_qbo_settings)

    assert payload["TxnDate"] == "2026-01-15"
    assert payload["DocNumber"] == "VC-col-1"
    assert payload["DepositToAccountRef"] == {"value": "ACC-DEPOSIT"}
    assert len(payload["Line"]) == 2
    assert payload["Line"][0]["Amount"] == 100.50
    assert payload["Line"][1]["Amount"] == 25.00
    for line in payload["Line"]:
        assert line["SalesItemLineDetail"]["ItemRef"] == {"value": "ITEM-SALES"}
        assert line["SalesItemLineDetail"]["ClassRef"] == {"value": machine.qbo_class_id}


def test_build_sales_receipt_skips_zero_tender_lines(machine, complete_qbo_settings):
    entry = CollectionEntry(
        id="col-2", machine_id=machine.id, collection_date=date(2026, 1, 15),
        cash_collected_cents=5000, cashless_collected_cents=0,
    )
    payload = mapping.build_sales_receipt(entry, machine, complete_qbo_settings)
    assert len(payload["Line"]) == 1


def test_build_sales_receipt_requires_machine_class(machine, complete_qbo_settings):
    machine.qbo_class_id = ""
    entry = CollectionEntry(
        id="col-3", machine_id=machine.id, collection_date=date(2026, 1, 15), cash_collected_cents=100
    )
    with pytest.raises(ValueError, match="no QBO class"):
        mapping.build_sales_receipt(entry, machine, complete_qbo_settings)


def test_build_sales_receipt_requires_amount(machine, complete_qbo_settings):
    entry = CollectionEntry(
        id="col-4", machine_id=machine.id, collection_date=date(2026, 1, 15),
        cash_collected_cents=0, cashless_collected_cents=0,
    )
    with pytest.raises(ValueError, match="no cash or cashless amount"):
        mapping.build_sales_receipt(entry, machine, complete_qbo_settings)


def test_build_restock_purchase_maps_to_cogs_account(machine, complete_qbo_settings):
    entry = RestockEntry(
        id="rst-1", machine_id=machine.id, restock_date=date(2026, 1, 10), product_cost_cents=4200
    )
    payload = mapping.build_restock_purchase(entry, machine, complete_qbo_settings)

    assert payload["DocNumber"] == "VR-rst-1"
    assert payload["PaymentType"] == "Cash"
    assert payload["AccountRef"] == {"value": "ACC-PAYMENT"}
    line_detail = payload["Line"][0]["AccountBasedExpenseLineDetail"]
    assert line_detail["AccountRef"] == {"value": "ACC-COGS"}
    assert line_detail["ClassRef"] == {"value": machine.qbo_class_id}
    assert payload["Line"][0]["Amount"] == 42.00
    assert "EntityRef" not in payload


def test_build_commission_purchase_includes_vendor_entity_ref(machine, complete_qbo_settings):
    machine.qbo_vendor_id = "VEND-1"
    payment = CommissionPayment(
        id="pay-1", machine_id=machine.id, payment_date=date(2026, 1, 20), amount_cents=1999
    )
    payload = mapping.build_commission_purchase(payment, machine, complete_qbo_settings)

    assert payload["DocNumber"] == "VP-pay-1"
    assert payload["EntityRef"] == {"value": "VEND-1", "type": "Vendor"}
    assert payload["Line"][0]["AccountBasedExpenseLineDetail"]["AccountRef"] == {"value": "ACC-COMMISSION"}
    assert payload["Line"][0]["Amount"] == 19.99


def test_build_commission_purchase_without_vendor_id_omits_entity_ref(machine, complete_qbo_settings):
    machine.qbo_vendor_id = ""
    payment = CommissionPayment(
        id="pay-2", machine_id=machine.id, payment_date=date(2026, 1, 20), amount_cents=500
    )
    payload = mapping.build_commission_purchase(payment, machine, complete_qbo_settings)
    assert "EntityRef" not in payload


def test_build_maintenance_purchase_maps_to_maintenance_account(machine, complete_qbo_settings):
    expense = MaintenanceExpense(
        id="mnt-1", machine_id=machine.id, expense_date=date(2026, 1, 22),
        amount_cents=8800, description="New bill validator",
    )
    payload = mapping.build_maintenance_purchase(expense, machine, complete_qbo_settings)

    assert payload["DocNumber"] == "VM-mnt-1"
    assert payload["Line"][0]["AccountBasedExpenseLineDetail"]["AccountRef"] == {"value": "ACC-MAINTENANCE"}
    assert "New bill validator" in payload["PrivateNote"]


def test_doc_numbers_stay_within_qbo_21_char_limit(machine, complete_qbo_settings):
    entry = RestockEntry(
        id="a" * 32, machine_id=machine.id, restock_date=date(2026, 1, 1), product_cost_cents=100
    )
    payload = mapping.build_restock_purchase(entry, machine, complete_qbo_settings)
    assert len(payload["DocNumber"]) <= 21
