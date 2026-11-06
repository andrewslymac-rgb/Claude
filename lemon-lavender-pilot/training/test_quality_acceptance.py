import hashlib
import io
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
from unittest.mock import Mock, patch
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from .tests import PilotCase
from .models import Attempt, Assignment, LiveCall
from .live_budget import TestBudget, MicrophoneBudget, BudgetDenied
from .live_credentials import ServerSecret, CredentialUnavailable
from .live_runtime import LiveController
from .voice_quality_acceptance import VoiceQualityBudget, ensure_assignment, CHOICES, fingerprint
from .sales_scenarios import scenario_snapshot
from .policies import POLICY


SYNTHETIC_PREVIOUS_CONFIGURATION = 'synthetic-previous-configuration-not-a-real-grant'


def synthetic_unused_grant():
    """Inert, test-only stand-in for the archived unused grant.

    The real approval artifact is intentionally excluded from transfers and must
    never be copied or reconstructed. This builds a structurally identical ledger
    through the production prepare() path, marks it synthetic, and returns a
    matching review record so reviewed_prompt_refresh() runs its exact checks.
    """
    with tempfile.TemporaryDirectory() as folder:
        budget=VoiceQualityBudget(folder);budget.prepare(3)
        data=json.loads((Path(folder)/(budget.storage_name+'.json')).read_text())
    scope=data['authorization']
    scope.update(source_thread='synthetic-test-fixture',proposal_reference='synthetic-test-fixture',
                 approval_reference='synthetic-test-fixture',owner_response='synthetic-test-fixture',
                 approved_scope='Synthetic test fixture. Authorizes nothing.',
                 configuration_sha256=SYNTHETIC_PREVIOUS_CONFIGURATION)
    review={'id':'synthetic-test-review','approval':VoiceQualityBudget.approval,'assignment_id':3,
            'original_authorization_sha256':hashlib.sha256(json.dumps(scope,sort_keys=True).encode()).hexdigest(),
            'from_sha256':SYNTHETIC_PREVIOUS_CONFIGURATION,'to_sha256':fingerprint()}
    # Same serialization as BudgetLedger.locked(), so byte-equality checks stay meaningful.
    return json.dumps(data,sort_keys=True).encode(),review


class QualityBudgetTests(SimpleTestCase):
    def test_explicit_prompt_refresh_preserves_unused_grant_and_exact_limits(self):
        original,review=synthetic_unused_grant()
        with patch.dict('training.quality_configuration_review.REVIEW',review),tempfile.TemporaryDirectory() as folder:
            budget=VoiceQualityBudget(folder);path=Path(folder)/(budget.storage_name+'.json');path.write_bytes(original)
            before_mtime=path.stat().st_mtime_ns
            result=budget.check_prepared(3,CHOICES)
            self.assertEqual(result['starts_used'],0);self.assertEqual(result['configuration_sha256'],fingerprint())
            self.assertNotEqual(result['configuration_sha256'],result['original_configuration_sha256'])
            self.assertEqual(path.read_bytes(),original);self.assertEqual(path.stat().st_mtime_ns,before_mtime)
            self.assertEqual(list(Path(folder).iterdir()),[path])
            budget.arm();budget.validate_binding(3,CHOICES)
            scenario=scenario_snapshot('busy_parent','intermediate');scenario['input_mode']='microphone'
            call=SimpleNamespace(attempt=SimpleNamespace(assignment_id=3,policy=POLICY,scenario=scenario))
            budget.validate_call(call);self.assertEqual(path.read_bytes(),original)
            budget.reserve('one');budget.voice_closed('one',240);budget.authorize_grading('one');budget.finish('one',confirmed=True,grading_cents='.1');budget.close()
            with self.assertRaises(BudgetDenied):budget.arm()
            with self.assertRaises(BudgetDenied):budget.reserve('another')
            after=json.loads(path.read_bytes());before=json.loads(original)
            self.assertEqual(after['authorization'],before['authorization']);self.assertEqual(after['history'],before['history'])

    def test_prompt_refresh_rejects_future_edits_and_scope_tampering(self):
        from copy import deepcopy
        raw,review=synthetic_unused_grant();original=json.loads(raw)
        with patch.dict('training.quality_configuration_review.REVIEW',review),tempfile.TemporaryDirectory() as folder:
            budget=VoiceQualityBudget(folder);path=Path(folder)/(budget.storage_name+'.json')
            for field,value in [('assignment_id',4),('max_cents',200),('max_seconds',600),('max_starts',2),
                                ('coaching_requests',2),('persona_id','office'),('approval_reference','unreviewed')]:
                data=deepcopy(original);data['authorization'][field]=value;path.write_text(json.dumps(data))
                with self.assertRaises(BudgetDenied):budget.check_prepared(data['authorization']['assignment_id'],CHOICES)
            path.write_text(json.dumps(original))
            with patch('training.voice_quality_acceptance.fingerprint',return_value='unreviewed-future-config'):
                with self.assertRaises(BudgetDenied):budget.check_prepared(3,CHOICES)
            original['calls']={'used':{'state':'reserved'}};path.write_text(json.dumps(original))
            with self.assertRaises(BudgetDenied):budget.check_prepared(3,CHOICES)

    def test_new_grant_is_separate_and_cannot_replenish_used_starts(self):
        with tempfile.TemporaryDirectory() as folder:
            for cls in (TestBudget,MicrophoneBudget):
                old=cls(folder);old.arm();old.reserve('historical');old.close()
            originals={p.name:p.read_bytes() for p in Path(folder).glob('*.json')}
            budget=VoiceQualityBudget(folder);budget.prepare(3);budget.prepare(3);budget.arm()
            data=budget.summary();self.assertEqual(data['calls'],{})
            self.assertEqual(data['authorization']['max_cents'],100);self.assertEqual(data['authorization']['max_seconds'],300)
            self.assertEqual(data['authorization']['active_seconds'],240);self.assertEqual(data['authorization']['max_starts'],1)
            for name,raw in originals.items():
                self.assertEqual(data['authorization']['prior_authorization_sha256'][name],hashlib.sha256(raw).hexdigest())
            budget.validate_binding(3,CHOICES);budget.reserve('one');budget.voice_closed('one',250)
            budget.authorize_grading('one')
            with self.assertRaises(BudgetDenied):budget.authorize_grading('one')
            budget.finish('one',confirmed=True,grading_cents='.2');budget.close()
            for operation in [budget.arm,lambda:budget.reserve('two'),lambda:budget.resume_unused('yes'),lambda:budget.resume_finalized('yes','one')]:
                with self.assertRaises(BudgetDenied):operation()
            for name,raw in originals.items():self.assertEqual((Path(folder)/name).read_bytes(),raw)

    def test_setup_and_runtime_reject_changed_scope_and_configuration(self):
        with tempfile.TemporaryDirectory() as folder:
            budget=VoiceQualityBudget(folder)
            with self.assertRaises(BudgetDenied):budget.arm()
            budget.prepare(3)
            for assignment,choices in [(4,CHOICES),(3,(('price_shopper','advanced'),)),(3,())]:
                with self.assertRaises(BudgetDenied):budget.validate_binding(assignment,choices)
            scenario=scenario_snapshot('busy_parent','intermediate');scenario['input_mode']='microphone'
            call=SimpleNamespace(attempt=SimpleNamespace(assignment_id=3,policy=POLICY,scenario=scenario))
            budget.validate_call(call);scenario['profile']['opening']='Unauthorized replacement'
            # Caller renderer takes opening_text as the authoritative opening.
            scenario['opening_text']='Unauthorized replacement'
            with self.assertRaises(BudgetDenied):budget.validate_call(call)
            path=Path(folder)/(budget.storage_name+'.json');data=json.loads(path.read_text())
            data['authorization']['max_starts']=2;path.write_text(json.dumps(data))
            with self.assertRaises(BudgetDenied):budget.arm()

    def test_uncertain_or_excess_duration_closes_and_blocks_coaching(self):
        with tempfile.TemporaryDirectory() as folder:
            budget=VoiceQualityBudget(folder);budget.prepare(3);budget.arm();budget.reserve('one')
            with self.assertRaises(BudgetDenied):budget.voice_closed('one',301)
            self.assertTrue(budget.summary()['closed'])
            with self.assertRaises(BudgetDenied):budget.authorize_grading('one')


class QualityViewsTests(PilotCase):
    def setUp(self):
        self.sign_as();self.quality=ensure_assignment()
        self.controller=Mock(armed=True,input_mode='microphone',assignment_id=self.quality.pk,
            scenario_choices=CHOICES,budget=SimpleNamespace(approval=VoiceQualityBudget.approval),sessions={})
        self.patcher=patch('training.live_views.controller',self.controller);self.patcher.start();self.addCleanup(self.patcher.stop)

    def start(self,**changes):
        data={'consent':True,'input_mode':'microphone','mic_check_passed':True,'persona_id':'busy_parent','difficulty':'intermediate',**changes}
        return self.client.post(reverse('live_start',args=[self.quality.pk]),json.dumps(data),content_type='application/json')

    def test_fixed_preparation_and_safe_signin_redirect_never_start_call(self):
        self.client.logout();self.client.get(reverse('voice_quality_test'),follow=True)
        self.assertEqual(self.client.session.get('post_login_path'),'/voice-quality-test/')
        response=self.client.post(reverse('sign_in'),{'email':'learner@example.invalid'})
        token=response.context['preview']['url'].split('#')[1]
        self.client.get(reverse('magic'));self.assertNotIn('_auth_user_id',self.client.session)
        response=self.client.post(reverse('magic'),{'token':token})
        self.assertRedirects(response,reverse('voice_quality_test'),fetch_redirect_response=False)
        response=self.client.get(reverse('live_prepare',args=[self.quality.pk]),{'persona_id':'office','difficulty':'advanced'})
        self.assertContains(response,'data-persona="busy_parent"');self.assertContains(response,'data-difficulty="intermediate"')
        self.assertContains(response,'four minutes');self.assertIsNone(response.context['selection_form'])
        self.controller.start.assert_not_called();self.assertEqual(Attempt.objects.count(),0)

    def test_wrong_caller_or_missing_consent_is_denied_before_attempt_creation(self):
        for changes in [{'persona_id':''},{'difficulty':'advanced'},{'persona_id':'office'}, {'consent':False},{'mic_check_passed':False}]:
            self.assertIn(self.start(**changes).status_code,[400,409])
        self.controller.start.assert_not_called();self.assertEqual(Attempt.objects.count(),0)

    def test_only_one_start_correct_saved_scope_and_review_destination(self):
        response=self.start();self.assertEqual(response.status_code,201)
        attempt=Attempt.objects.get(pk=response.json()['attempt_id'])
        self.assertEqual(attempt.live_call.approval,VoiceQualityBudget.approval)
        self.assertEqual(attempt.limits['live_seconds'],240)
        self.assertEqual(fingerprint(attempt.policy,attempt.scenario),fingerprint())
        self.assertTrue(self.start().json()['duplicate']);self.assertEqual(self.controller.start.call_count,1)
        attempt.status='submitted';attempt.save()
        self.assertRedirects(self.client.get(reverse('voice_quality_test')),reverse('live_detail',args=[attempt.pk]),fetch_redirect_response=False)
        self.assertEqual(self.start().status_code,409)
        self.quality.refresh_from_db();self.assertIsNone(self.quality.lesson_completed_at)
        self.assertRedirects(self.client.get(reverse('home')),reverse('course',args=[self.assignment.pk]),fetch_redirect_response=False)


class QualityCommandTests(PilotCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        folder=Path(self.temp.name)
        self.override=override_settings(LIVE_MOCK=True,QA_DIR=folder,DATABASES={'default':{'ENGINE':'django.db.backends.sqlite3','NAME':folder/'qa.sqlite3'}})
        # Only command path validation uses settings.DATABASES; test DB connection remains managed by Django.
        self.override.enable();self.addCleanup(self.override.disable)
        self.output=io.StringIO()

    def command(self,**options):
        return call_command('serve_voice_quality_test',stdout=self.output,**options)

    def test_prepare_and_check_do_not_read_credentials_open_transport_or_microphone(self):
        with patch('training.management.commands.serve_voice_quality_test.read_project_key') as key,patch('training.live_runtime.OpenAILiveTransport') as transport:
            self.command(prepare=True);self.command(check=True)
        key.assert_not_called();transport.assert_not_called()
        self.assertEqual(VoiceQualityBudget(settings.QA_DIR).summary()['calls'],{})
        self.assertIn('Check-only',self.output.getvalue())

    def test_check_is_readonly_and_never_arms_controller_or_budget(self):
        self.command(prepare=True)
        path=Path(settings.QA_DIR)/(VoiceQualityBudget.storage_name+'.json')
        before=path.read_bytes();modified=path.stat().st_mtime_ns
        with (patch.object(VoiceQualityBudget,'arm',side_effect=AssertionError('Check must not arm')),
             patch('training.management.commands.serve_voice_quality_test.read_project_key',side_effect=AssertionError('No credential access'))):
            self.command(check=True)
        self.assertEqual(path.read_bytes(),before);self.assertEqual(path.stat().st_mtime_ns,modified)

    def test_busy_port_fails_before_credential_and_keeps_allowance_unused(self):
        self.command(prepare=True)
        with patch('training.management.commands.serve_voice_quality_test.socket.socket') as socket,patch('training.management.commands.serve_voice_quality_test.read_project_key') as key:
            socket.return_value.__enter__.return_value.bind.side_effect=OSError('occupied')
            with self.assertRaises(CommandError):self.command(allow_keychain_prompt=True)
        key.assert_not_called();self.assertEqual(VoiceQualityBudget(settings.QA_DIR).summary()['calls'],{})

    def test_native_denial_does_not_start_server_or_repair_credential(self):
        self.command(prepare=True)
        with patch('training.management.commands.serve_voice_quality_test.socket.socket'),patch('training.management.commands.serve_voice_quality_test.read_project_key',side_effect=CredentialUnavailable('macos_authorization_denied')) as key,patch('training.management.commands.serve_voice_quality_test.call_command') as serve:
            with self.assertRaises(CommandError):self.command(allow_keychain_prompt=True)
        key.assert_called_once_with(allow_prompt=True);serve.assert_not_called()
        self.assertEqual(VoiceQualityBudget(settings.QA_DIR).summary()['calls'],{})

    def test_launch_arms_exact_scope_but_never_connects_until_browser_start(self):
        self.command(prepare=True);engine=LiveController()
        with patch('training.management.commands.serve_voice_quality_test.socket.socket'),patch('training.management.commands.serve_voice_quality_test.read_project_key',return_value=ServerSecret('sk-fictional-only')),patch('training.management.commands.serve_voice_quality_test.controller',engine),patch('training.live_runtime.OpenAILiveTransport') as transport,patch('training.management.commands.serve_voice_quality_test.call_command') as serve:
            self.command(allow_keychain_prompt=True)
        transport.assert_not_called();serve.assert_called_once()
        self.assertEqual(engine.scenario_choices,CHOICES);self.assertFalse(engine.armed);self.assertIsNone(engine.secret)
        data=VoiceQualityBudget(settings.QA_DIR).summary();self.assertTrue(data['closed']);self.assertEqual(data['calls'],{})
