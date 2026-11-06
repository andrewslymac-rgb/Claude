"""One persistent, fail-closed authorization shared across every test process."""
from contextlib import contextmanager
from decimal import Decimal
import fcntl
import json
import os
from pathlib import Path
from datetime import datetime, timezone

APPROVAL = 'andrew-2026-10-07T20:08Z'
MAX_CENTS = 200
MAX_VOICE_SECONDS = 600
MAX_CALLS = 2
RESERVED_SECONDS = 300  # Includes connection/startup and closure allowance.
RESERVED_CENTS = 100  # Far above 300s voice ($.25) + bounded coaching (<$.03).
VOICE_CENTS_PER_SECOND = Decimal(5) / Decimal(60)
MAX_ACTIVE_SECONDS = 240
IDLE_SECONDS = 30
CLIENT_GONE_SECONDS = 8


class BudgetDenied(Exception):
    pass


class TestBudget:
    approval = APPROVAL
    storage_name = 'live-test-authorization'
    max_cents = MAX_CENTS
    max_seconds = MAX_VOICE_SECONDS
    max_calls = MAX_CALLS
    input_mode = 'synthetic'
    close_after_call = False

    def __init__(self, directory):
        self.directory = Path(directory)

    @contextmanager
    def locked(self, create=False):
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        lock_path = self.directory / (self.storage_name + '.lock')
        fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            path = self.directory / (self.storage_name + '.json')
            if path.exists():
                if path.is_symlink():
                    raise BudgetDenied('Authorization storage is invalid.')
                try:
                    data = json.loads(path.read_text())
                    assert data['approval'] == self.approval and isinstance(data['calls'], dict)
                except Exception:
                    raise BudgetDenied('Authorization cannot be verified. Paid calls are disabled.') from None
            elif create:
                data = {'approval': self.approval, 'closed': False, 'calls': {},
                        'created_at': datetime.now(timezone.utc).isoformat()}
            else:
                raise BudgetDenied('The bounded voice test is not armed.')
            yield data
            # Atomic replacement, with one fixed lock across processes. Never
            # reopen the authorization automatically after closure or failure.
            temporary = self.directory / (self.storage_name + '.next')
            out = os.open(temporary, os.O_CREAT | os.O_TRUNC | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            with os.fdopen(out, 'w') as stream:
                json.dump(data, stream, sort_keys=True)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            os.close(fd)

    def arm(self):
        with self.locked(create=True) as data:
            if data['closed'] or any(v['state'] != 'finalized' for v in data['calls'].values()):
                raise BudgetDenied('A prior test is closed or unresolved. Further paid calls need review.')

    def resume_unused(self, authorization):
        """Explicit operator action only, after direct permission; never called by arm.

        Preserve the complete preceding ledger in an audit event. An existing
        reservation, even failed or finalized, makes this operation unavailable.
        It cannot replenish any time, money, or call allowance.
        """
        if not isinstance(authorization, str) or not authorization.strip():
            raise BudgetDenied('The explicit resume authorization must be recorded.')
        with self.locked() as data:
            if data.get('closed') is not True or data['calls']:
                raise BudgetDenied('Only a closed, entirely unused authorization can be resumed.')
            prior = json.loads(json.dumps(data))
            data.setdefault('history', []).append({
                'event': 'explicit_unused_resume',
                'at': datetime.now(timezone.utc).isoformat(),
                'authorization': authorization,
                'previous_record': prior,
                'combined_max_cents': MAX_CENTS,
                'combined_max_voice_seconds': MAX_VOICE_SECONDS,
            })
            data['closed'] = False

    def reserve(self, call_id):
        with self.locked() as data:
            calls = data['calls']
            if call_id in calls:
                raise BudgetDenied('This start was already reserved; it will not be repeated.')
            if (data['closed'] or len(calls) >= self.max_calls or
                    any(v['state'] != 'finalized' for v in calls.values()) or
                    sum(v['reserved_cents'] for v in calls.values()) + RESERVED_CENTS > self.max_cents or
                    sum(v['reserved_seconds'] for v in calls.values()) + RESERVED_SECONDS > self.max_seconds):
                raise BudgetDenied('The approved test allowance is unavailable. No new request was sent.')
            calls[call_id] = {'state': 'reserved', 'reserved_cents': RESERVED_CENTS,
                'reserved_seconds': RESERVED_SECONDS, 'grading_requested': False,
                'reported_seconds': None, 'estimated_cents': None}

    def resume_finalized(self, authorization, expected_call_id):
        """Explicit reviewed continuation, never a refund or automatic renewal."""
        if not isinstance(authorization, str) or not authorization.strip():
            raise BudgetDenied('The explicit retry authorization must be recorded.')
        with self.locked() as data:
            calls = data['calls']
            if data.get('closed') is not True or set(calls) != {expected_call_id}:
                raise BudgetDenied('Only the reviewed first call can precede this final retry.')
            call = calls[expected_call_id]
            try:
                seconds = Decimal(str(call['reported_seconds']))
                cost = Decimal(str(call['estimated_cents']))
                grading = Decimal(str(call['grading_estimated_cents'])) if call['grading_requested'] else Decimal(0)
                valid = (call['state'] == 'finalized' and
                    call['reserved_cents'] == RESERVED_CENTS and call['reserved_seconds'] == RESERVED_SECONDS and
                    seconds.is_finite() and 0 <= seconds <= RESERVED_SECONDS and
                    cost.is_finite() and cost == seconds * VOICE_CENTS_PER_SECOND and
                    grading.is_finite() and grading >= 0 and cost + grading <= RESERVED_CENTS and
                    2 * RESERVED_CENTS <= MAX_CENTS and 2 * RESERVED_SECONDS <= MAX_VOICE_SECONDS and MAX_CALLS == 2)
            except (KeyError, TypeError, ArithmeticError):
                valid = False
            if not valid:
                raise BudgetDenied('Prior usage or reserved allowance is unconfirmed; no retry is available.')
            prior = json.loads(json.dumps(data))
            data.setdefault('history', []).append({
                'event': 'explicit_finalized_retry_resume',
                'at': datetime.now(timezone.utc).isoformat(),
                'authorization': authorization,
                'previous_record': prior,
                'remaining_starts': 1,
                'remaining_reserved_cents': MAX_CENTS - RESERVED_CENTS,
                'remaining_reserved_seconds': MAX_VOICE_SECONDS - RESERVED_SECONDS,
                'combined_max_cents': MAX_CENTS,
                'combined_max_voice_seconds': MAX_VOICE_SECONDS,
            })
            data['closed'] = False

    def authorize_grading(self, call_id):
        with self.locked() as data:
            call = data['calls'][call_id]
            if data['closed'] or call['grading_requested'] or call['state'] not in {'reserved', 'voice_closed'}:
                raise BudgetDenied('Coaching allowance is unavailable.')
            call['grading_requested'] = True

    def voice_closed(self, call_id, seconds):
        seconds = Decimal(str(seconds))
        if not seconds.is_finite() or not 0 <= seconds <= RESERVED_SECONDS:
            self.finish(call_id, confirmed=False)
            raise BudgetDenied('Unexpected provider duration. Paid mode stopped for review.')
        with self.locked() as data:
            data['calls'][call_id].update(state='voice_closed', reported_seconds=str(seconds),
                estimated_cents=str(seconds * VOICE_CENTS_PER_SECOND))

    def finish(self, call_id, *, confirmed, grading_cents=None):
        with self.locked() as data:
            call = data['calls'][call_id]
            call['state'] = 'finalized' if confirmed else 'unconfirmed'
            call['grading_estimated_cents'] = str(grading_cents) if grading_cents is not None else None
            if not confirmed:
                data['closed'] = True

    def close(self):
        with self.locked() as data:
            data['closed'] = True

    def summary(self):
        with self.locked() as data:
            return json.loads(json.dumps(data))


class MicrophoneBudget(TestBudget):
    """New one-start approval. Cannot touch or replenish the prior synthetic grant."""
    approval = 'andrew-microphone-2026-10-07T22:24Z'
    storage_name = 'microphone-acceptance-authorization'
    max_cents = 100
    max_seconds = 300
    max_calls = 1
    input_mode = 'microphone'
    close_after_call = True

    def arm(self):
        with self.locked(create=True) as data:
            if data.get('closed') or data['calls']:
                raise BudgetDenied('This one-start microphone allowance is closed or already used.')
            data.setdefault('authorization', {
                'source': 'Owner yes at 2026-10-07 22:24 UTC, forwarded from parent conversation',
                'reference': 'Sentinel_25454cab39708191b9f55d494f25dc25',
                'scope': 'One user-operated fictional microphone acceptance call and transcript coaching; no automatic start or retry.',
                'max_cents': 100, 'max_seconds': 300, 'max_starts': 1,
                'prior_synthetic_authorization': APPROVAL,
            })

    def resume_unused(self, authorization):
        raise BudgetDenied('The microphone grant cannot be reopened by the synthetic-test resume flow.')

    def resume_finalized(self, authorization, expected_call_id):
        raise BudgetDenied('The microphone grant permits one start only; no automatic renewal.')
