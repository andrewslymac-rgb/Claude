import json
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from .tests import PilotCase
from .models import Attempt, LiveCall, Review
from .live_budget import TestBudget, MicrophoneBudget, BudgetDenied
from .live_credentials import ServerSecret
from .live_runtime import LiveController
from .microphone_acceptance import ensure_assignment


class MicrophoneBudgetTests(SimpleTestCase):
    def test_separate_file_and_original_ledger_bytes_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            prior = TestBudget(directory); prior.arm(); prior.reserve('prior'); prior.close()
            path = Path(directory) / 'live-test-authorization.json'
            original = path.read_bytes()
            mic = MicrophoneBudget(directory); mic.arm(); mic.reserve('mic')
            mic.voice_closed('mic', 120); mic.authorize_grading('mic')
            mic.finish('mic', confirmed=True, grading_cents='.1'); mic.close()
            self.assertEqual(path.read_bytes(), original)
            data = mic.summary()
            self.assertEqual(data['calls']['mic']['reserved_cents'], 100)
            self.assertEqual(data['calls']['mic']['reserved_seconds'], 300)
            self.assertEqual(data['authorization']['max_starts'], 1)
            for operation in (lambda: mic.arm(), lambda: mic.reserve('second'),
                              lambda: mic.resume_unused('Approved'), lambda: mic.resume_finalized('Approved', 'mic')):
                with self.assertRaises(BudgetDenied): operation()

    def test_restart_with_prior_reservation_never_rearms(self):
        with tempfile.TemporaryDirectory() as directory:
            mic = MicrophoneBudget(directory); mic.arm(); mic.reserve('one')
            with self.assertRaises(BudgetDenied): MicrophoneBudget(directory).arm()
            with self.assertRaises(BudgetDenied): mic.reserve('two')

    def test_controller_requires_assignment_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(BudgetDenied):
                LiveController().arm(ServerSecret('sk-fictional'), MicrophoneBudget(directory))
            self.assertFalse((Path(directory) / 'microphone-acceptance-authorization.json').exists())


class MicrophoneViewTests(PilotCase):
    def setUp(self):
        self.sign_as()
        self.mic_assignment = ensure_assignment()
        self.controller = Mock(armed=True, input_mode='microphone', assignment_id=self.mic_assignment.pk,
                               budget=SimpleNamespace(approval=MicrophoneBudget.approval), sessions={})
        self.patcher = patch('training.live_views.controller', self.controller)
        self.patcher.start(); self.addCleanup(self.patcher.stop)

    def begin(self, **changes):
        payload = {'consent': True, 'input_mode': 'microphone', 'mic_check_passed': True, **changes}
        return self.client.post(reverse('live_start', args=[self.mic_assignment.pk]),
                                json.dumps(payload), content_type='application/json')

    def test_page_never_starts_call_and_permission_only_for_armed_learner(self):
        url = reverse('live_prepare', args=[self.mic_assignment.pk])
        response = self.client.get(url)
        self.assertContains(response, 'Check microphone locally')
        self.assertContains(response, 'audible background sound')
        self.assertIn('microphone=(self)', response['Permissions-Policy'])
        self.controller.start.assert_not_called()
        self.assertFalse(Attempt.objects.exists())
        self.controller.armed = False
        self.assertIn('microphone=()', self.client.get(url)['Permissions-Policy'])
        self.controller.armed = True
        for user in (self.trainer, self.admin):
            self.sign_as(user)
            self.assertIn('microphone=()', self.client.get(url)['Permissions-Policy'])
            self.assertEqual(self.begin().status_code, 403)

    def test_consent_mode_and_mic_check_required_before_start(self):
        for changes in ({'consent': False}, {'input_mode': 'synthetic'}, {'mic_check_passed': False}):
            self.assertEqual(self.begin(**changes).status_code, 400)
        self.controller.start.assert_not_called()
        self.assertFalse(Attempt.objects.exists())

    def test_separate_acceptance_does_not_change_pending_course_or_award_credit(self):
        pending = Attempt.objects.create(assignment=self.assignment, status='submitted')
        response = self.begin()
        self.assertEqual(response.status_code, 201)
        attempt = Attempt.objects.get(pk=response.json()['attempt_id'])
        self.assertEqual(attempt.assignment_id, self.mic_assignment.pk)
        self.assertFalse(attempt.scenario['synthetic_test'])
        self.assertEqual(attempt.scenario['input_mode'], 'microphone')
        self.assertEqual(attempt.live_call.approval, MicrophoneBudget.approval)
        self.assertFalse(attempt.live_call.synthetic_test)
        pending.refresh_from_db(); self.assertEqual(pending.status, 'submitted')
        self.mic_assignment.refresh_from_db()
        self.assertIsNone(self.mic_assignment.lesson_completed_at)
        self.assertFalse(Review.objects.exists())
        self.assertTrue(self.begin().json()['duplicate'])
        self.assertEqual(self.controller.start.call_count, 1)

    def test_microphone_grant_cannot_start_original_assignment(self):
        response = self.client.post(reverse('live_start', args=[self.assignment.pk]),
            json.dumps({'consent':True,'input_mode':'microphone','mic_check_passed':True}), content_type='application/json')
        self.assertEqual(response.status_code, 409)
        self.controller.start.assert_not_called()

    def test_finalization_closes_new_budget_and_releases_credential(self):
        response = self.begin(); attempt = Attempt.objects.get(pk=response.json()['attempt_id'])
        with tempfile.TemporaryDirectory() as directory, override_settings(LIVE_RECORDING_DIR=directory):
            engine = LiveController()
            engine.arm(ServerSecret('sk-fictional'), MicrophoneBudget(directory), assignment_id=self.mic_assignment.pk)
            engine.budget.reserve(str(attempt.pk))
            result = {'confirmed':True,'usage_seconds':10,'error_code':'','local_elapsed_seconds':10,'fragments':[]}
            with patch('training.live_runtime.request_coaching') as grading:
                engine.finalize(str(attempt.pk), result)
            grading.assert_not_called()
            self.assertFalse(engine.armed); self.assertIsNone(engine.secret)
            self.assertTrue(engine.budget.summary()['closed'])
            with self.assertRaises(BudgetDenied): engine.budget.reserve('second')

    def test_only_fixed_mic_destination_is_kept_for_signin(self):
        self.client.logout()
        self.client.get(reverse('sign_in'), {'next':'/microphone-test/'})
        self.assertEqual(self.client.session.get('post_login_path'), '/microphone-test/')
        for target in ('https://outside.invalid/', '//outside.invalid/', '/admin/'):
            self.client.get(reverse('sign_in'), {'next':target})
            self.assertNotIn('post_login_path', self.client.session)

    def test_magic_link_returns_to_mic_page_without_starting_it(self):
        self.client.logout()
        self.client.get(reverse('sign_in'), {'next':'/microphone-test/'})
        response = self.client.post(reverse('sign_in'), {'email':'learner@example.invalid'})
        token = response.context['preview']['url'].split('#')[1]
        self.client.get(reverse('magic'))
        self.assertNotIn('_auth_user_id', self.client.session)
        response = self.client.post(reverse('magic'), {'token':token})
        self.assertRedirects(response, reverse('microphone_test'), fetch_redirect_response=False)
        self.controller.start.assert_not_called()
