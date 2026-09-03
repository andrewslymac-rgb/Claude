from datetime import date

from app.models import CollectionEntry, CommissionPayment, SourceType, SyncRecord, SyncStatus
from app.qbo.client import QboApiError
from app.qbo import sync as sync_service


class FakeQboClient:
    """In-memory stand-in for QboClient -- no network, tracks call counts so
    tests can assert nothing is ever double-created."""

    def __init__(self, fail_entities: set[str] | None = None):
        self._store: dict[str, dict] = {}
        self._next_id = 1
        self.create_calls: list[tuple[str, dict]] = []
        self.update_calls: list[tuple[str, dict]] = []
        self.get_calls: list[tuple[str, str]] = []
        self.fail_entities = fail_entities or set()

    def create(self, entity: str, payload: dict) -> dict:
        self.create_calls.append((entity, payload))
        if entity in self.fail_entities:
            raise QboApiError(400, f"Simulated failure creating {entity}")
        obj_id = str(self._next_id)
        self._next_id += 1
        record = {**payload, "Id": obj_id, "SyncToken": "0"}
        self._store[f"{entity}:{obj_id}"] = record
        return record

    def update(self, entity: str, payload: dict) -> dict:
        self.update_calls.append((entity, payload))
        key = f"{entity}:{payload['Id']}"
        current = self._store[key]
        new_token = str(int(current["SyncToken"]) + 1)
        record = {**payload, "SyncToken": new_token}
        self._store[key] = record
        return record

    def get(self, entity: str, entity_id: str) -> dict:
        self.get_calls.append((entity, entity_id))
        return self._store[f"{entity}:{entity_id}"]


def _make_collection(db_session, machine, amount=10000):
    entry = CollectionEntry(
        machine_id=machine.id, collection_date=date(2026, 1, 15), cash_collected_cents=amount
    )
    db_session.add(entry)
    db_session.commit()
    return entry


def test_sync_one_creates_sales_receipt_and_marks_synced(db_session, machine, complete_qbo_settings):
    entry = _make_collection(db_session, machine)
    client = FakeQboClient()

    result = sync_service.sync_one(db_session, client, complete_qbo_settings, SourceType.COLLECTION, entry.id)

    assert result.status == SyncStatus.SYNCED
    assert result.qbo_id
    record = db_session.query(SyncRecord).filter_by(source_type=SourceType.COLLECTION, source_id=entry.id).one()
    assert record.status == SyncStatus.SYNCED
    assert record.qbo_id == result.qbo_id
    assert [e for e, _ in client.create_calls] == ["SalesReceipt"]


def test_sync_one_is_idempotent_no_duplicate_on_second_run(db_session, machine, complete_qbo_settings):
    entry = _make_collection(db_session, machine)
    client = FakeQboClient()

    first = sync_service.sync_one(db_session, client, complete_qbo_settings, SourceType.COLLECTION, entry.id)
    second = sync_service.sync_one(db_session, client, complete_qbo_settings, SourceType.COLLECTION, entry.id)

    # Only one SalesReceipt should ever be created; the second call updates.
    assert len([c for c in client.create_calls if c[0] == "SalesReceipt"]) == 1
    assert len(client.update_calls) == 1
    assert first.qbo_id == second.qbo_id


def test_sync_all_pending_skips_already_synced_records(db_session, machine, complete_qbo_settings):
    entry = _make_collection(db_session, machine)
    client = FakeQboClient()

    sync_service.sync_all_pending(db_session, client, complete_qbo_settings)
    assert len(sync_service.list_pending_sync_targets(db_session)) == 0

    # A second batch run with nothing new to sync must not touch the API again.
    results = sync_service.sync_all_pending(db_session, client, complete_qbo_settings)
    assert results == []
    assert len(client.create_calls) == 1


def test_sync_one_failure_is_captured_without_raising(db_session, machine, complete_qbo_settings):
    entry = _make_collection(db_session, machine)
    client = FakeQboClient(fail_entities={"SalesReceipt"})

    result = sync_service.sync_one(db_session, client, complete_qbo_settings, SourceType.COLLECTION, entry.id)

    assert result.status == SyncStatus.FAILED
    assert "Simulated failure" in result.error
    record = db_session.query(SyncRecord).filter_by(source_type=SourceType.COLLECTION, source_id=entry.id).one()
    assert record.status == SyncStatus.FAILED
    assert record.last_error


def test_sync_all_pending_continues_after_one_failure(db_session, machine, complete_qbo_settings):
    good_entry = _make_collection(db_session, machine, amount=1000)
    bad_payment = CommissionPayment(machine_id=machine.id, payment_date=date(2026, 1, 16), amount_cents=500)
    db_session.add(bad_payment)
    db_session.commit()

    client = FakeQboClient(fail_entities={"Purchase"})
    results = sync_service.sync_all_pending(db_session, client, complete_qbo_settings)

    statuses = {(r.source_type, r.source_id): r.status for r in results}
    assert statuses[(SourceType.COLLECTION, good_entry.id)] == SyncStatus.SYNCED
    assert statuses[(SourceType.COMMISSION, bad_payment.id)] == SyncStatus.FAILED


def test_retry_failed_resyncs_only_failed_records(db_session, machine, complete_qbo_settings):
    entry = _make_collection(db_session, machine)
    failing_client = FakeQboClient(fail_entities={"SalesReceipt"})
    sync_service.sync_one(db_session, failing_client, complete_qbo_settings, SourceType.COLLECTION, entry.id)

    working_client = FakeQboClient()
    results = sync_service.retry_failed(db_session, working_client, complete_qbo_settings)

    assert len(results) == 1
    assert results[0].status == SyncStatus.SYNCED
    record = db_session.query(SyncRecord).filter_by(source_type=SourceType.COLLECTION, source_id=entry.id).one()
    assert record.status == SyncStatus.SYNCED


def test_ensure_machine_qbo_refs_creates_class_once(db_session, machine, complete_qbo_settings):
    machine.qbo_class_id = ""
    db_session.add(machine)
    db_session.commit()
    client = FakeQboClient()

    sync_service.ensure_machine_qbo_refs(db_session, client, complete_qbo_settings, machine)
    first_class_id = machine.qbo_class_id
    assert first_class_id

    sync_service.ensure_machine_qbo_refs(db_session, client, complete_qbo_settings, machine)
    assert machine.qbo_class_id == first_class_id
    assert len([c for c in client.create_calls if c[0] == "Class"]) == 1


def test_ensure_machine_qbo_refs_creates_vendor_only_when_needed(db_session, machine, complete_qbo_settings):
    machine.qbo_vendor_id = ""
    db_session.add(machine)
    db_session.commit()
    client = FakeQboClient()

    sync_service.ensure_machine_qbo_refs(db_session, client, complete_qbo_settings, machine, need_vendor=False)
    assert machine.qbo_vendor_id == ""
    assert not any(c[0] == "Vendor" for c in client.create_calls)

    sync_service.ensure_machine_qbo_refs(db_session, client, complete_qbo_settings, machine, need_vendor=True)
    assert machine.qbo_vendor_id


def test_sync_one_missing_local_record_fails_gracefully(db_session, machine, complete_qbo_settings):
    client = FakeQboClient()
    result = sync_service.sync_one(
        db_session, client, complete_qbo_settings, SourceType.COLLECTION, "does-not-exist"
    )
    assert result.status == SyncStatus.FAILED
    assert not client.create_calls


def test_sync_one_blocked_by_incomplete_account_settings(db_session, machine):
    from app.models import QboAccountSettings

    incomplete_settings = QboAccountSettings(id=1)  # nothing configured
    db_session.add(incomplete_settings)
    db_session.commit()

    entry = _make_collection(db_session, machine)
    client = FakeQboClient()

    result = sync_service.sync_one(db_session, client, incomplete_settings, SourceType.COLLECTION, entry.id)
    assert result.status == SyncStatus.FAILED
    assert "account mapping is incomplete" in result.error
    assert not client.create_calls
