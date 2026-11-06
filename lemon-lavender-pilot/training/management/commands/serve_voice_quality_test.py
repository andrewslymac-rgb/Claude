"""Human-only real launch; check/prepare modes never touch Keychain or a provider."""
import socket
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from training.live_credentials import read_project_key, CredentialUnavailable
from training.live_budget import BudgetDenied
from training.live_runtime import controller
from training.voice_quality_acceptance import VoiceQualityBudget, ensure_assignment, CHOICES, COURSE_SLUG, PORT
from training.models import Assignment


class Command(BaseCommand):
    help='Prepare, check or serve the separately approved one-start voice-quality test.'

    def add_arguments(self,parser):
        modes=parser.add_mutually_exclusive_group()
        modes.add_argument('--prepare',action='store_true')
        modes.add_argument('--check',action='store_true')
        parser.add_argument('--allow-keychain-prompt',action='store_true')

    def handle(self,*args,**options):
        mock=bool(getattr(settings,'LIVE_MOCK',False))
        directory=settings.QA_DIR if mock else settings.DATA_DIR
        expected=directory/('qa.sqlite3' if mock else 'pilot.sqlite3')
        if settings.DATABASES['default']['NAME']!=expected:
            raise CommandError('Use only the isolated local Training Center database.')
        if controller.armed:
            raise CommandError('A test is already armed in this process.')
        budget=VoiceQualityBudget(directory)
        try:
            if options['prepare']:
                assignment=ensure_assignment();budget.prepare(assignment.pk)
                self.stdout.write('Separate quality-test allowance prepared: one start, $1 total, 300 seconds reserved / 240 active. No credential read, microphone or API call.')
                return
            assignment=Assignment.objects.get(course__slug=COURSE_SLUG,learner__email='learner@example.invalid')
            if options['check']:
                budget.check_prepared(assignment.pk,CHOICES)
                self.stdout.write('Prepared scope verified; zero starts used. Check-only: no credential access, microphone or API call. Human launcher uses http://127.0.0.1:8769/voice-quality-test/')
                return
            budget.validate_binding(assignment.pk,CHOICES);budget.arm()
            port=8768 if mock else PORT
            # Refuse a busy port before a native credential prompt; never kill another server.
            with socket.socket() as probe:
                probe.bind(('127.0.0.1',port))
            secret=read_project_key(allow_prompt=options['allow_keychain_prompt'])
            controller.arm(secret,budget,assignment_id=assignment.pk,scenario_choices=CHOICES)
        except (CredentialUnavailable,BudgetDenied) as exc:
            raise CommandError(str(exc)) from None
        except Assignment.DoesNotExist:
            raise CommandError('Prepare the dedicated quality test first. No credential or provider was accessed.') from None
        except OSError:
            raise CommandError('The local test port is unavailable. No credential or provider was accessed; do not start another test server.') from None
        self.stdout.write(f'Open http://127.0.0.1:{port}/voice-quality-test/ on this Mac; sign in as learner@example.invalid through the local preview.')
        self.stdout.write('Existing Keychain credential stays server-side. Check the microphone locally; only your deliberate Start call connects to OpenAI.')
        self.stdout.write('One start, $1 additional total including coaching. Active cutoff: 4 minutes; 5 minutes reserved for startup/closure. Control-C closes this allowance. No automatic retry.')
        try:
            call_command('runserver',f'127.0.0.1:{port}',use_reloader=False,use_threading=False,verbosity=0)
        finally:
            controller.disable()
            self.stdout.write('Quality-test mode disabled. All previous authorizations remain unchanged.')
