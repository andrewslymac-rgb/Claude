"""Sync service: pushes local records into QuickBooks Online.

Duplicate prevention is centered entirely on the SyncRecord table: every
push first looks up (source_type, source_id) there. If a SYNCED row
already exists, we UPDATE that QBO object (after fetching its current
SyncToken, since QBO requires an up-to-date token on every update) rather
than creating a new one. A record is never marked SYNCED until QuickBooks
has actually confirmed the write, so a crash mid-sync just leaves it
PENDING/FAILED for the next run to pick up -- it can never silently
double-post.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import (
    CollectionEntry,
    CommissionPayment,
    MaintenanceExpense,
    Machine,
    QboAccountSettings,
    RestockEntry,
    SourceType,
    SyncRecord,
    SyncStatus,
)
from app.qbo import mapping
from app.qbo.client import QboApiError, QboClient

_MODEL_BY_SOURCE = {
    SourceType.COLLECTION: CollectionEntry,
    SourceType.RESTOCK: RestockEntry,
    SourceType.COMMISSION: CommissionPayment,
    SourceType.MAINTENANCE: MaintenanceExpense,
}

_ENTITY_BY_SOURCE = {
    SourceType.COLLECTION: "SalesReceipt",
    SourceType.RESTOCK: "Purchase",
    SourceType.COMMISSION: "Purchase",
    SourceType.MAINTENANCE: "Purchase",
}

_BUILDERS = {
    SourceType.COLLECTION: mapping.build_sales_receipt,
    SourceType.RESTOCK: mapping.build_restock_purchase,
    SourceType.COMMISSION: mapping.build_commission_purchase,
    SourceType.MAINTENANCE: mapping.build_maintenance_purchase,
}


class SyncConfigError(RuntimeError):
    """Settings aren't complete enough to sync yet (missing account mapping)."""


@dataclass
class SyncResult:
    source_type: SourceType
    source_id: str
    status: SyncStatus
    qbo_id: str = ""
    error: str = ""


def _get_or_create_sync_record(db: Session, source_type: SourceType, source_id: str) -> SyncRecord:
    record = (
        db.query(SyncRecord)
        .filter_by(source_type=source_type, source_id=source_id)
        .one_or_none()
    )
    if record is None:
        record = SyncRecord(source_type=source_type, source_id=source_id, status=SyncStatus.PENDING)
        db.add(record)
        db.flush()
    return record


def ensure_machine_qbo_refs(
    db: Session, client: QboClient, settings: QboAccountSettings, machine: Machine, need_vendor: bool = False
) -> None:
    """Lazily create the QBO Class/Department (and Vendor, if needed) for a
    machine the first time it has something to sync, so every transaction
    for this machine can be tagged consistently.
    """
    if not machine.qbo_class_id:
        entity = "Class" if settings.tracking_type == "Class" else "Department"
        payload = (
            mapping.build_class_payload(machine.name)
            if entity == "Class"
            else mapping.build_department_payload(machine.name)
        )
        created = client.create(entity, payload)
        machine.qbo_class_id = created["Id"]
        db.add(machine)
        db.flush()

    if need_vendor and not machine.qbo_vendor_id:
        display_name = machine.location_contact_name or f"{machine.location_name} owner"
        created = client.create(
            "Vendor", mapping.build_vendor_payload(display_name, machine.location_contact_email)
        )
        machine.qbo_vendor_id = created["Id"]
        db.add(machine)
        db.flush()


def sync_one(db: Session, client: QboClient, settings: QboAccountSettings, source_type: SourceType, source_id: str) -> SyncResult:
    model = _MODEL_BY_SOURCE[source_type]
    entity = _ENTITY_BY_SOURCE[source_type]
    builder = _BUILDERS[source_type]

    record = _get_or_create_sync_record(db, source_type, source_id)
    obj = db.get(model, source_id)
    if obj is None:
        record.status = SyncStatus.FAILED
        record.last_error = "Local record no longer exists"
        record.last_attempt_at = datetime.utcnow()
        db.commit()
        return SyncResult(source_type, source_id, SyncStatus.FAILED, error=record.last_error)

    record.last_attempt_at = datetime.utcnow()
    try:
        if not settings.is_complete():
            raise SyncConfigError(
                "QuickBooks account mapping is incomplete -- finish setup on the Settings page first."
            )

        machine = obj.machine
        ensure_machine_qbo_refs(
            db, client, settings, machine, need_vendor=(source_type == SourceType.COMMISSION)
        )

        payload = builder(obj, machine, settings)

        if record.qbo_id:
            # Fetch the current object so we have an up-to-date SyncToken --
            # required by QBO on every update, and avoids clobbering a
            # change made directly in QuickBooks since our last sync.
            current = client.get(entity, record.qbo_id)
            payload["Id"] = current["Id"]
            payload["SyncToken"] = current["SyncToken"]
            result = client.update(entity, payload)
        else:
            result = client.create(entity, payload)

        record.qbo_entity = entity
        record.qbo_id = result["Id"]
        record.qbo_sync_token = result.get("SyncToken", "")
        record.status = SyncStatus.SYNCED
        record.last_error = ""
        record.synced_at = datetime.utcnow()
        db.commit()
        return SyncResult(source_type, source_id, SyncStatus.SYNCED, qbo_id=record.qbo_id)

    except QboApiError as exc:
        db.rollback()
        record = _get_or_create_sync_record(db, source_type, source_id)
        record.status = SyncStatus.FAILED
        record.last_error = exc.message
        record.last_attempt_at = datetime.utcnow()
        db.commit()
        return SyncResult(source_type, source_id, SyncStatus.FAILED, error=exc.message)
    except Exception as exc:  # noqa: BLE001 - deliberately broad: never let one bad
        # record crash a batch sync; surface the error on the record instead.
        db.rollback()
        record = _get_or_create_sync_record(db, source_type, source_id)
        record.status = SyncStatus.FAILED
        record.last_error = str(exc)
        record.last_attempt_at = datetime.utcnow()
        db.commit()
        return SyncResult(source_type, source_id, SyncStatus.FAILED, error=str(exc))


def list_pending_sync_targets(db: Session) -> list[tuple[SourceType, str]]:
    """Every local record that has never successfully synced."""
    targets: list[tuple[SourceType, str]] = []
    for source_type, model in _MODEL_BY_SOURCE.items():
        synced_ids = {
            r.source_id
            for r in db.query(SyncRecord).filter_by(source_type=source_type, status=SyncStatus.SYNCED)
        }
        for obj in db.query(model).all():
            if obj.id not in synced_ids:
                targets.append((source_type, obj.id))
    return targets


def sync_all_pending(db: Session, client: QboClient, settings: QboAccountSettings) -> list[SyncResult]:
    results = []
    for source_type, source_id in list_pending_sync_targets(db):
        results.append(sync_one(db, client, settings, source_type, source_id))
    return results


def retry_failed(db: Session, client: QboClient, settings: QboAccountSettings) -> list[SyncResult]:
    failed = db.query(SyncRecord).filter_by(status=SyncStatus.FAILED).all()
    results = []
    for record in failed:
        results.append(sync_one(db, client, settings, record.source_type, record.source_id))
    return results
