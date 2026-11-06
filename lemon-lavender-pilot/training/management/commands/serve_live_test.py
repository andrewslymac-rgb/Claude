"""Explicit one-off owner-approved process; normal start.command stays offline."""
from pathlib import Path
import wave
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from training.live_budget import TestBudget, BudgetDenied
from training.live_credentials import read_project_key, CredentialUnavailable
from training.live_runtime import controller
from training.live_fixture import validate_fixture


class Command(BaseCommand):
    help = 'Serve the specifically approved synthetic voice test on 127.0.0.1:8767.'

    def add_arguments(self, parser):
        parser.add_argument('--allow-keychain-prompt', action='store_true',
                            help='Andrew must handle any native macOS prompt personally.')

    def handle(self, *args, **options):
        if settings.DATABASES['default']['NAME'] != settings.DATA_DIR / 'pilot.sqlite3':
            raise CommandError('The approved test uses the isolated Training Center database only.')
        if not (settings.DATA_DIR / 'live-test-fixture.wav').is_file():
            raise CommandError('Build the offline fictional fixture first: manage.py build_live_fixture')
        try:
            validate_fixture(settings.DATA_DIR / 'live-test-fixture.wav')
        except (ValueError, wave.Error, OSError) as exc:
            raise CommandError(str(exc)) from None
        if controller.armed:
            raise CommandError('A test is already armed in this process.')
        try:
            secret = read_project_key(allow_prompt=options['allow_keychain_prompt'])
            controller.arm(secret, TestBudget(settings.DATA_DIR))
        except (CredentialUnavailable, BudgetDenied) as exc:
            raise CommandError(str(exc)) from None
        self.stdout.write('Bounded synthetic test ready at http://127.0.0.1:8767. No call starts until Start test call is pressed.')
        self.stdout.write('Shared approval: at most $2 and 600 reserved voice seconds, two starts maximum. Control-C permanently closes this test authorization.')
        try:
            call_command('runserver', '127.0.0.1:8767', use_reloader=False, use_threading=False, verbosity=0)
        finally:
            controller.disable()
            self.stdout.write('Paid test mode disabled. Normal local training remains available.')
