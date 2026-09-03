from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import RedirectResponse

from app.config import get_settings
from app.database import get_db
from app.flash import flash
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
from app.qbo import sync as sync_service
from app.qbo.client import QboClient, QboNotConnectedError
from app.templating import render

router = APIRouter(prefix="/sync", tags=["sync"])

_MODEL_BY_SOURCE = {
    SourceType.COLLECTION: CollectionEntry,
    SourceType.RESTOCK: RestockEntry,
    SourceType.COMMISSION: CommissionPayment,
    SourceType.MAINTENANCE: MaintenanceExpense,
}


def _describe(db: Session, record: SyncRecord) -> str:
    model = _MODEL_BY_SOURCE.get(record.source_type)
    if model is None:
        return record.source_id
    obj = db.get(model, record.source_id)
    if obj is None:
        return f"(deleted {record.source_type.value} entry)"
    machine = db.get(Machine, obj.machine_id)
    machine_name = machine.name if machine else "?"
    if record.source_type == SourceType.COLLECTION:
        return f"Collection - {machine_name} - {obj.collection_date}"
    if record.source_type == SourceType.RESTOCK:
        return f"Restock - {machine_name} - {obj.restock_date}"
    if record.source_type == SourceType.COMMISSION:
        return f"Commission - {machine_name} - {obj.payment_date}"
    if record.source_type == SourceType.MAINTENANCE:
        return f"Maintenance - {machine_name} - {obj.expense_date}"
    return record.source_id


@router.get("")
def sync_status(request: Request, db: Session = Depends(get_db)):
    records = db.query(SyncRecord).order_by(SyncRecord.last_attempt_at.desc().nullslast()).all()
    rows = [
        {
            "record": r,
            "description": _describe(db, r),
        }
        for r in records
    ]
    # Records that have never even been attempted don't have a SyncRecord
    # row yet -- synthesize one (never added to the session) so they still
    # show up with a "Sync now" action instead of only being reachable via
    # the bulk button.
    seen = {(r.source_type, r.source_id) for r in records}
    for source_type, source_id in sync_service.list_pending_sync_targets(db):
        if (source_type, source_id) in seen:
            continue
        placeholder = SyncRecord(source_type=source_type, source_id=source_id, status=SyncStatus.PENDING)
        rows.append({"record": placeholder, "description": _describe(db, placeholder)})

    pending_count = len(sync_service.list_pending_sync_targets(db))
    failed_count = db.query(SyncRecord).filter_by(status=SyncStatus.FAILED).count()
    account_settings = db.get(QboAccountSettings, 1)
    return render(
        request,
        "sync_status.html",
        rows=rows,
        pending_count=pending_count,
        failed_count=failed_count,
        mapping_complete=account_settings.is_complete() if account_settings else False,
    )


@router.post("/all")
def sync_all(request: Request, db: Session = Depends(get_db)):
    app_settings = get_settings()
    account_settings = db.get(QboAccountSettings, 1)
    if account_settings is None or not account_settings.is_complete():
        flash(request, "Finish the QuickBooks account mapping in Settings before syncing.", "error")
        return RedirectResponse(url="/settings", status_code=303)
    try:
        client = QboClient(db, app_settings)
    except QboNotConnectedError:
        flash(request, "Connect to QuickBooks in Settings first.", "error")
        return RedirectResponse(url="/settings", status_code=303)

    results = sync_service.sync_all_pending(db, client, account_settings)
    succeeded = sum(1 for r in results if r.status == SyncStatus.SYNCED)
    failed = sum(1 for r in results if r.status == SyncStatus.FAILED)
    if not results:
        flash(request, "Nothing to sync -- everything is already up to date.", "info")
    else:
        flash(request, f"Sync complete: {succeeded} succeeded, {failed} failed.", "success" if not failed else "error")
    return RedirectResponse(url="/sync", status_code=303)


@router.post("/retry")
def retry_all_failed(request: Request, db: Session = Depends(get_db)):
    app_settings = get_settings()
    account_settings = db.get(QboAccountSettings, 1)
    try:
        client = QboClient(db, app_settings)
    except QboNotConnectedError:
        flash(request, "Connect to QuickBooks in Settings first.", "error")
        return RedirectResponse(url="/settings", status_code=303)

    results = sync_service.retry_failed(db, client, account_settings)
    succeeded = sum(1 for r in results if r.status == SyncStatus.SYNCED)
    still_failed = sum(1 for r in results if r.status == SyncStatus.FAILED)
    flash(request, f"Retried {len(results)} record(s): {succeeded} now synced, {still_failed} still failing.", "info")
    return RedirectResponse(url="/sync", status_code=303)


@router.post("/one/{source_type}/{source_id}")
def sync_single(request: Request, source_type: str, source_id: str, db: Session = Depends(get_db)):
    app_settings = get_settings()
    account_settings = db.get(QboAccountSettings, 1)
    try:
        client = QboClient(db, app_settings)
    except QboNotConnectedError:
        flash(request, "Connect to QuickBooks in Settings first.", "error")
        return RedirectResponse(url="/settings", status_code=303)

    result = sync_service.sync_one(db, client, account_settings, SourceType(source_type), source_id)
    if result.status == SyncStatus.SYNCED:
        flash(request, "Synced to QuickBooks.", "success")
    else:
        flash(request, f"Sync failed: {result.error}", "error")
    return RedirectResponse(url="/sync", status_code=303)
