"""Disposable, offline live-protocol browser rehearsal. Never reads a credential."""
import base64
from collections import deque
import os
from pathlib import Path
import sys
import time
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.browser_qa_settings'
import django
django.setup()
from django.conf import settings
from django.core.management import call_command
from django.utils import timezone
from training.models import Assignment
from training.live_budget import TestBudget, MicrophoneBudget
from training.live_credentials import ServerSecret
from training.live_provider import CATEGORIES
from training.live_runtime import controller


class FakeTransport:
    def __init__(self, secret):
        self.events = deque(); self.chunks = 0
    def open(self, config):
        self.events.append({'type': 'session.started', 'session': config})
        self.events.append({'type': 'session.output_transcript.delta', 'delta': 'I need biweekly cleaning for my 2000 square foot home.', 'start_ms': 0, 'end_ms': 1800})
        self.events.append({'type': 'session.output_audio.delta', 'delta': base64.b64encode(b'\0\0' * 2400).decode()})
    def send(self, event):
        if event['type'] == 'session.input_audio.append':
            self.chunks += 1
            if self.chunks == 3:
                self.events.append({'type': 'session.input_transcript.delta', 'delta': 'What cleaning priorities matter most? The initial deep is $570, then $220 biweekly. Shall I send a service request?', 'start_ms': 2000, 'end_ms': 5000})
                self.events.append({'type': 'session.output_transcript.delta', 'delta': 'Yes, please send the request and check availability.', 'start_ms': 5500, 'end_ms': 7000})
        elif event['type'] == 'session.close':
            self.events.append({'type': 'session.closed', 'usage': {'seconds': 8}})
    def receive(self, timeout=.04):
        if self.events: return self.events.popleft()
        time.sleep(timeout)
    def close(self): pass


def fake_coaching(secret, payload):
    report = {'observations': [{'title': title, 'status': 'observed', 'evidence_ids': ['live-2'],
        'coaching': 'Offline protocol rehearsal only; verify the cited fictional evidence.'} for title in CATEGORIES],
        'policy_flags': [], 'next_practice': 'Let the customer explain their priority before giving price.'}
    return report, {'model': 'offline-mock', 'input_tokens': 0, 'output_tokens': 0,
                    'estimated_cents': '0', 'price_version': 'offline-mock', 'provider_reported_cost': None}


if __name__ == '__main__':
    call_command('migrate', verbosity=0); call_command('seed_demo', verbosity=0)
    Assignment.objects.update(welcome_completed_at=timezone.now(), lesson_completed_at=timezone.now())
    settings.LIVE_RECORDING_DIR = settings.QA_DIR / 'live-recordings'
    settings.LIVE_MOCK = True
    from training.sales_content import PERSONAS, DIFFICULTIES
    choices=tuple((p,d) for p in PERSONAS for d in DIFFICULTIES) if '--varied' in sys.argv else ()
    if '--microphone' in sys.argv:
        from training.microphone_acceptance import ensure_assignment
        assignment = ensure_assignment()
        controller.arm(ServerSecret('sk-fictional-mock-never-sent'), MicrophoneBudget(settings.QA_DIR), assignment_id=assignment.pk, scenario_choices=choices)
    else:
        controller.arm(ServerSecret('sk-fictional-mock-never-sent'), TestBudget(settings.QA_DIR), scenario_choices=choices)
    with patch('training.live_runtime.OpenAILiveTransport', FakeTransport), patch('training.live_runtime.request_coaching', fake_coaching):
        try: call_command('runserver', '127.0.0.1:8768', use_reloader=False, use_threading=False, verbosity=0)
        finally: controller.disable()
