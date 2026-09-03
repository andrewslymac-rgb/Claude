"""Pure functions that turn local records into QuickBooks Online JSON
payloads. Nothing in this file touches the network -- that's what makes
it fully unit-testable and the safest place to double-check the
transaction-to-account mapping before anything ever syncs.

Mapping decisions (confirm these in Settings before your first real sync
-- see README "QuickBooks account mapping" for the full rationale):

* Collection entries (cash + cashless) -> a Sales Receipt, one line per
  tender type, using the single "sales item" configured in Settings, so
  both post to the same income account. Deposited to Undeposited Funds
  (or whatever account you configure) so it matches how you actually
  batch cash into the bank.
* Restock cost, commission payments, and maintenance expenses -> a
  Purchase (an already-paid expense, not a Bill) against the expense
  account configured for that category, paid from the "expense payment
  account" configured in Settings.
* Every transaction is tagged with the machine's QBO Class or Department
  (per Settings > tracking_type) so QuickBooks reports (P&L by class/
  location) break out cleanly per machine.
* Commission payments are also tagged to a QBO Vendor representing the
  location owner, so QuickBooks can produce 1099s for them if needed.
"""

from app.models import (
    CollectionEntry,
    CommissionPayment,
    MaintenanceExpense,
    Machine,
    QboAccountSettings,
    RestockEntry,
)


def _doc_number(prefix: str, source_id: str) -> str:
    # QBO DocNumbers are capped at 21 characters.
    return f"{prefix}-{source_id}"[:21]


def _tracking_ref(machine: Machine, settings: QboAccountSettings) -> dict:
    key = "ClassRef" if settings.tracking_type == "Class" else "DepartmentRef"
    return {key: {"value": machine.qbo_class_id}}


def build_sales_receipt(
    entry: CollectionEntry, machine: Machine, settings: QboAccountSettings
) -> dict:
    if not machine.qbo_class_id:
        raise ValueError(f"Machine {machine.id} has no QBO class/department assigned yet")
    if not settings.sales_item_ref:
        raise ValueError("QBO sales item is not configured in Settings")

    lines = []
    if entry.cash_collected_cents:
        lines.append(
            {
                "Amount": entry.cents_to_dollars(entry.cash_collected_cents).__float__(),
                "DetailType": "SalesItemLineDetail",
                "Description": f"Cash collected - {machine.name} - {entry.collection_date.isoformat()}",
                "SalesItemLineDetail": {
                    "ItemRef": {"value": settings.sales_item_ref},
                    **_tracking_ref(machine, settings),
                },
            }
        )
    if entry.cashless_collected_cents:
        lines.append(
            {
                "Amount": entry.cents_to_dollars(entry.cashless_collected_cents).__float__(),
                "DetailType": "SalesItemLineDetail",
                "Description": f"Cashless sales - {machine.name} - {entry.collection_date.isoformat()}",
                "SalesItemLineDetail": {
                    "ItemRef": {"value": settings.sales_item_ref},
                    **_tracking_ref(machine, settings),
                },
            }
        )
    if not lines:
        raise ValueError("Collection entry has no cash or cashless amount to sync")

    return {
        "TxnDate": entry.collection_date.isoformat(),
        "DocNumber": _doc_number("VC", entry.id),
        "DepositToAccountRef": {"value": settings.deposit_account_ref},
        "PrivateNote": entry.notes or "",
        "Line": lines,
    }


def _build_purchase(
    *,
    txn_date,
    doc_number: str,
    amount_cents: int,
    expense_account_ref: str,
    payment_account_ref: str,
    machine: Machine,
    settings: QboAccountSettings,
    description: str,
    vendor_id: str | None = None,
) -> dict:
    if not machine.qbo_class_id:
        raise ValueError(f"Machine {machine.id} has no QBO class/department assigned yet")
    if not payment_account_ref:
        raise ValueError("QBO expense payment account is not configured in Settings")
    if not expense_account_ref:
        raise ValueError("QBO expense account is not configured in Settings")

    line_detail = {"AccountRef": {"value": expense_account_ref}}
    line_detail.update(_tracking_ref(machine, settings))

    payload = {
        "TxnDate": txn_date.isoformat(),
        "DocNumber": doc_number,
        "PaymentType": "Cash",
        "AccountRef": {"value": payment_account_ref},
        "PrivateNote": description,
        "Line": [
            {
                "Amount": CollectionEntry.cents_to_dollars(amount_cents).__float__(),
                "DetailType": "AccountBasedExpenseLineDetail",
                "Description": description,
                "AccountBasedExpenseLineDetail": line_detail,
            }
        ],
    }
    if vendor_id:
        payload["EntityRef"] = {"value": vendor_id, "type": "Vendor"}
    return payload


def build_restock_purchase(entry: RestockEntry, machine: Machine, settings: QboAccountSettings) -> dict:
    return _build_purchase(
        txn_date=entry.restock_date,
        doc_number=_doc_number("VR", entry.id),
        amount_cents=entry.product_cost_cents,
        expense_account_ref=settings.cogs_account_ref,
        payment_account_ref=settings.expense_payment_account_ref,
        machine=machine,
        settings=settings,
        description=f"Restock - {machine.name} - {entry.restock_date.isoformat()}"
        + (f" - {entry.notes}" if entry.notes else ""),
    )


def build_commission_purchase(
    payment: CommissionPayment, machine: Machine, settings: QboAccountSettings
) -> dict:
    return _build_purchase(
        txn_date=payment.payment_date,
        doc_number=_doc_number("VP", payment.id),
        amount_cents=payment.amount_cents,
        expense_account_ref=settings.commission_account_ref,
        payment_account_ref=settings.expense_payment_account_ref,
        machine=machine,
        settings=settings,
        description=f"Commission - {machine.name} - {payment.payment_date.isoformat()}"
        + (f" - {payment.notes}" if payment.notes else ""),
        vendor_id=machine.qbo_vendor_id or None,
    )


def build_maintenance_purchase(
    expense: MaintenanceExpense, machine: Machine, settings: QboAccountSettings
) -> dict:
    return _build_purchase(
        txn_date=expense.expense_date,
        doc_number=_doc_number("VM", expense.id),
        amount_cents=expense.amount_cents,
        expense_account_ref=settings.maintenance_account_ref,
        payment_account_ref=settings.expense_payment_account_ref,
        machine=machine,
        settings=settings,
        description=f"Maintenance - {machine.name} - {expense.description or expense.expense_date.isoformat()}",
    )


def build_class_payload(name: str) -> dict:
    return {"Name": name}


def build_department_payload(name: str) -> dict:
    return {"Name": name}


def build_vendor_payload(display_name: str, email: str = "") -> dict:
    payload = {"DisplayName": display_name}
    if email:
        payload["PrimaryEmailAddr"] = {"Address": email}
    return payload
