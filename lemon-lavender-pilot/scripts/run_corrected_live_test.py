"""One explicit bounded retry; reviewed as a paid operation before execution.

Does not read credentials. Andrew opens the existing native launcher personally.
No automatic provider retry. Prior cost, recordings and reservations stay intact.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from training.live_budget import TestBudget
from training.live_fixture import validate_fixture
from training.live_retry import prepare_silent_fixture_retry

PRIOR = '08962784-1958-4032-9854-594f16613119'
AUTHORIZATION = ('Direct user instruction in this execution thread: Run the corrected fictional-audio test '
    'and transcript coaching using the remaining allowance, preserving the original $2 / 10-minute cap and all history. '
    'This follows the parent-forwarded confirmation Sentinel_3041acd9e01081918c361b901d6a9398, 2026-10-07 22:07 UTC. '
    'Execution remains subject to automatic approval review; this audit text does not override it.')


def listening():
    with socket.socket() as probe:
        probe.settimeout(.3)
        return probe.connect_ex(('127.0.0.1', 8767)) == 0


def stop_test_server():
    result = subprocess.run(['/usr/sbin/lsof', '-t', '-iTCP:8767', '-sTCP:LISTEN'], capture_output=True, text=True)
    ids = result.stdout.split()
    if len(ids) != 1 or not ids[0].isdigit():
        return
    pid = int(ids[0])
    cwd = subprocess.run(['/usr/sbin/lsof', '-a', '-p', str(pid), '-d', 'cwd', '-Fn'], capture_output=True, text=True)
    if 'n' + str(ROOT) in cwd.stdout.splitlines():
        os.kill(pid, signal.SIGINT)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute-approved-retry', action='store_true', required=True)
    parser.parse_args()
    if listening():
        raise SystemExit('A test server is already running; reconcile its state before proceeding.')
    validate_fixture(ROOT / '.data/live-test-fixture.wav')
    budget = TestBudget(ROOT / '.data')
    before = budget.summary()
    # Preserve the first provider artifacts, even when the corrected test fails.
    destination = ROOT / 'artifacts/first-provider-test'
    destination.mkdir(exist_ok=True)
    for name in ('live-provider-browser.json', 'live-provider-saved.jpg', 'live-provider-manager.jpg'):
        source = ROOT / 'artifacts' / name
        if source.is_file() and not (destination / name).exists():
            (destination / name).write_bytes(source.read_bytes())
    prepare_silent_fixture_retry(budget, PRIOR, AUTHORIZATION)
    try:
        (ROOT / 'artifacts/corrected-retry-resume.json').write_text(json.dumps({
            'before': before, 'after': budget.summary(), 'physical_microphone': False}, indent=2) + '\n')
        print('Ready for Andrew to open the EXISTING start-approved-voice-test.command and handle any native Keychain prompt. No API call has started.', flush=True)
        deadline = time.monotonic() + 180
        while not listening():
            if time.monotonic() >= deadline:
                raise SystemExit('No test server appeared within three minutes; no API call was made. Authorization will close.')
            time.sleep(.5)
        # Exactly one invocation. Its UI start must consume the second reservation.
        result = subprocess.run([str(ROOT / '.venv/bin/python'), str(ROOT / 'scripts/review_live.py'), '--provider'],
                                cwd=ROOT, timeout=210)
        raise SystemExit(result.returncode)
    finally:
        stop_test_server()
        budget.close()
        print('Corrected-test run ended. Authorization closed; no additional retry scheduled.', flush=True)


if __name__ == '__main__':
    main()
