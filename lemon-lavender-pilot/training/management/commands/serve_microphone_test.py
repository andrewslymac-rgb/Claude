"""Human-launched mic server. No microphone/API access until deliberate browser Start."""
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from training.live_budget import MicrophoneBudget, BudgetDenied
from training.live_credentials import read_project_key, CredentialUnavailable
from training.live_runtime import controller
from training.microphone_acceptance import ensure_assignment


class Command(BaseCommand):
    help = 'Serve the one-start user-operated microphone acceptance test on loopback.'

    def add_arguments(self, parser):
        parser.add_argument('--allow-keychain-prompt', action='store_true')

    def handle(self, *args, **options):
        if settings.DATABASES['default']['NAME'] != settings.DATA_DIR / 'pilot.sqlite3':
            raise CommandError('Use only the isolated local Training Center database.')
        budget = MicrophoneBudget(settings.DATA_DIR)
        try:
            # Reject exhausted grants before requesting native credential access.
            budget.arm()
            assignment = ensure_assignment()
            secret = read_project_key(allow_prompt=options['allow_keychain_prompt'])
            controller.arm(secret, budget, assignment_id=assignment.pk)
        except (CredentialUnavailable, BudgetDenied) as exc:
            raise CommandError(str(exc)) from None
        self.stdout.write('Open http://127.0.0.1:8767/microphone-test/ and sign in as learner@example.invalid using the local email preview.')
        self.stdout.write('Check microphone locally, then deliberately press Start call. No provider call starts from this launcher.')
        self.stdout.write('New separate limit: one start, $1 including coaching, 300 seconds reserved; maximum active connection 240 seconds. Control-C closes this grant.')
        try:
            call_command('runserver', '127.0.0.1:8767', use_reloader=False, use_threading=False, verbosity=0)
        finally:
            controller.disable()
            self.stdout.write('Microphone test disabled. The original synthetic-test ledger was not changed.')
