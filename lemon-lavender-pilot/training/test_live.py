"""Boundaries and evidence tests. Never reads the real Keychain or calls OpenAI."""
import base64
from decimal import Decimal
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest.mock import Mock, patch
import wave
from django.test import SimpleTestCase, override_settings, Client
from django.urls import reverse
from django.utils import timezone
from .tests import PilotCase
from .models import Attempt, Assignment, LiveCall, Review, UsageEntry
from .policies import snapshots
from .live_budget import TestBudget, BudgetDenied
from .live_credentials import ServerSecret, read_project_key, CredentialUnavailable
from .live_provider import conversation_config, coaching_payload, OpenAILiveTransport, ProviderFailure, CATEGORIES
from .live_runtime import CallSession, TimelineAudio, LiveController
from .live_coaching import build_feedback, transcript_turns


class BudgetTests(SimpleTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(); self.addCleanup(self.directory.cleanup)
        self.budget = TestBudget(self.directory.name); self.budget.arm()

    def test_shared_persistent_cap_and_no_automatic_renewal(self):
        other = TestBudget(self.directory.name)
        for number in range(2):
            self.budget.reserve(str(number))
            self.budget.voice_closed(str(number), 120)
            self.budget.authorize_grading(str(number))
            self.budget.finish(str(number), confirmed=True, grading_cents=Decimal('.15'))
        with self.assertRaises(BudgetDenied): other.reserve('third')
        self.budget.close()
        with self.assertRaises(BudgetDenied): other.arm()
        data = other.summary()
        self.assertEqual(sum(c['reserved_cents'] for c in data['calls'].values()), 200)
        self.assertEqual(sum(c['reserved_seconds'] for c in data['calls'].values()), 600)

    def test_repeated_start_and_concurrent_call_denied(self):
        self.budget.reserve('one')
        for ident in ('one', 'two'):
            with self.assertRaises(BudgetDenied): TestBudget(self.directory.name).reserve(ident)

    def test_coaching_only_once(self):
        self.budget.reserve('one'); self.budget.authorize_grading('one')
        with self.assertRaises(BudgetDenied): self.budget.authorize_grading('one')

    def test_unconfirmed_charge_locks_future_calls(self):
        self.budget.reserve('one'); self.budget.finish('one', confirmed=False)
        with self.assertRaises(BudgetDenied): self.budget.reserve('two')

    def test_bad_provider_duration_closes_grant(self):
        self.budget.reserve('one')
        with self.assertRaises(BudgetDenied): self.budget.voice_closed('one', 301)
        self.assertTrue(self.budget.summary()['closed'])

    def test_corrupt_ledger_fails_closed(self):
        (Path(self.directory.name) / 'live-test-authorization.json').write_text('{}')
        with self.assertRaises(BudgetDenied): self.budget.reserve('one')

    def test_private_ledger_mode(self):
        path = Path(self.directory.name) / 'live-test-authorization.json'
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_explicit_unused_resume_preserves_complete_prior_record(self):
        self.budget.close()
        before = self.budget.summary()
        self.budget.resume_unused('Direct user request to resume the same unused test.')
        after = self.budget.summary()
        self.assertEqual(after['approval'], before['approval'])
        self.assertEqual(after['created_at'], before['created_at'])
        self.assertEqual(after['calls'], before['calls'])
        self.assertEqual(after['history'][0]['previous_record'], before)
        self.assertEqual(after['history'][0]['combined_max_cents'], 200)
        self.assertEqual(after['history'][0]['combined_max_voice_seconds'], 600)
        self.assertFalse(after['closed'])
        self.budget.arm()

    def test_resume_requires_closed_grant_and_recorded_permission(self):
        with self.assertRaises(BudgetDenied): self.budget.resume_unused('Approved')
        self.budget.close()
        for permission in ('', ' ', None):
            with self.assertRaises(BudgetDenied): self.budget.resume_unused(permission)
        self.assertTrue(self.budget.summary()['closed'])

    def test_resume_never_replenishes_used_or_uncertain_allowance(self):
        self.budget.reserve('one')
        for state in ('reserved', 'voice_closed', 'finalized', 'unconfirmed'):
            with self.budget.locked() as data:
                data['calls']['one']['state'] = state
                data['closed'] = True
            before = self.budget.summary()
            with self.assertRaises(BudgetDenied): self.budget.resume_unused('Approved')
            self.assertEqual(self.budget.summary(), before)

    def test_resume_repetition_does_not_create_a_second_allowance(self):
        self.budget.close(); self.budget.resume_unused('Approved')
        before = self.budget.summary()
        with self.assertRaises(BudgetDenied): self.budget.resume_unused('Approved')
        self.assertEqual(self.budget.summary(), before)
        for number in range(2):
            self.budget.reserve(str(number))
            self.budget.voice_closed(str(number), 120)
            self.budget.finish(str(number), confirmed=True)
        with self.assertRaises(BudgetDenied): self.budget.reserve('third')

    def test_missing_ledger_cannot_be_recreated_by_resume(self):
        path = Path(self.directory.name) / 'live-test-authorization.json'
        path.unlink()
        with self.assertRaises(BudgetDenied): self.budget.resume_unused('Approved')
        self.assertFalse(path.exists())

    def completed_first_call(self):
        self.budget.reserve('one')
        self.budget.voice_closed('one', 117)
        self.budget.finish('one', confirmed=True)
        self.budget.close()

    def test_finalized_retry_preserves_history_and_all_reservations(self):
        self.completed_first_call()
        before = self.budget.summary()
        self.budget.resume_finalized('Explicit corrected retry approval', 'one')
        after = self.budget.summary()
        self.assertEqual(after['calls'], before['calls'])
        self.assertEqual(after['created_at'], before['created_at'])
        self.assertEqual(after['approval'], before['approval'])
        self.assertEqual(after['history'][-1]['previous_record'], before)
        self.budget.reserve('two')
        self.budget.voice_closed('two', 120)
        self.budget.finish('two', confirmed=True)
        self.budget.close()
        self.assertEqual(sum(c['reserved_cents'] for c in self.budget.summary()['calls'].values()), 200)
        self.assertEqual(sum(c['reserved_seconds'] for c in self.budget.summary()['calls'].values()), 600)
        with self.assertRaises(BudgetDenied): self.budget.resume_finalized('Approved', 'one')
        with self.assertRaises(BudgetDenied): self.budget.reserve('three')

    def test_finalized_retry_requires_matching_call_permission_and_closed_state(self):
        self.completed_first_call()
        before = self.budget.summary()
        for permission, ident in (('', 'one'), ('Approved', 'other')):
            with self.assertRaises(BudgetDenied): self.budget.resume_finalized(permission, ident)
            self.assertEqual(self.budget.summary(), before)
        self.budget.resume_finalized('Approved', 'one')
        with self.assertRaises(BudgetDenied): self.budget.resume_finalized('Approved', 'one')

    def test_finalized_retry_rejects_unknown_usage_or_refunded_reservations(self):
        self.completed_first_call()
        before = self.budget.summary()
        changes = [dict(state='unconfirmed'), dict(reported_seconds=None), dict(reported_seconds='NaN'),
            dict(estimated_cents='0'), dict(reserved_cents=0), dict(reserved_seconds=117),
            dict(grading_requested=True, grading_estimated_cents=None)]
        for change in changes:
            with self.budget.locked() as data:
                data['calls']['one'] = {**before['calls']['one'], **change}
            with self.assertRaises(BudgetDenied): self.budget.resume_finalized('Approved', 'one')
            self.assertTrue(self.budget.summary()['closed'])


class ProtocolTests(SimpleTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(); self.addCleanup(self.directory.cleanup)
        self.clock = Mock(return_value=0)
        self.transport = Mock()
        self.result = []
        self.session = CallSession('test', self.transport, conversation_config({}, {}),
            Path(self.directory.name), lambda _, result: self.result.append(result), clock=self.clock)

    def ready(self):
        self.session.handle({'type': 'session.started', 'session': conversation_config({}, {})}, Mock())

    def test_no_paid_delegation_or_provider_recording(self):
        config = conversation_config({}, {})
        self.assertEqual(config['model'], 'gpt-live-1')
        self.assertEqual(config['delegation'], {'type': 'client'})
        self.assertIs(config['store'], False)
        self.assertNotIn('tools', config)

    def test_wrong_model_stops_before_input(self):
        config = conversation_config({}, {}); config['model'] = 'unexpected'
        self.session.handle({'type': 'session.started', 'session': config}, Mock())
        self.assertTrue(self.session.stop_event.is_set())
        with self.assertRaises(ValueError): self.session.accept_audio(b'\0\0', 0)

    def test_duplicate_audio_ack_is_idempotent_and_out_of_order_denied(self):
        self.ready(); self.session.accept_audio(b'\0\0' * 100, 0)
        self.session.accept_audio(b'\0\0' * 100, 0)
        self.assertEqual(self.session.input_queue.qsize(), 1)
        with self.assertRaises(ValueError): self.session.accept_audio(b'\0\0', 2)

    def test_faster_than_realtime_audio_rejected(self):
        self.ready(); self.session.input_samples = 48000
        with self.assertRaises(ValueError): self.session.accept_audio(b'\0\0', 0)

    def test_usage_is_cumulative_and_final_confirmation_required(self):
        for seconds in (2, 4):
            self.session.handle({'type': 'session.usage.updated', 'usage': {'seconds': seconds}}, Mock())
        self.assertEqual(self.session.usage_seconds, 4)
        self.assertFalse(self.session.confirmed)
        self.session.handle({'type': 'session.closed', 'usage': {'seconds': 5}}, Mock())
        self.assertTrue(self.session.confirmed); self.assertEqual(self.session.usage_seconds, 5)

    def test_invalid_usage_and_transcript_do_not_enter_evidence(self):
        for value in (float('nan'), True, -1, 301):
            with self.assertRaises(ValueError):
                self.session.handle({'type': 'session.closed', 'usage': {'seconds': value}}, Mock())
        with self.assertRaises(ValueError):
            self.session.handle({'type': 'session.input_transcript.delta', 'delta': 'bad', 'start_ms': float('nan'), 'end_ms': 2}, Mock())
        self.assertEqual(self.session.fragments, [])

    def test_backend_delegation_local_and_deduplicated(self):
        event = {'type': 'session.delegation.created', 'delegation': {'id': 'a', 'target': 'client'}}
        self.session.handle(event, Mock()); self.session.handle(event, Mock())
        self.assertEqual(self.transport.send.call_count, 1)
        self.assertEqual(self.transport.send.call_args.args[0]['type'], 'session.thinking.append')

    def test_provider_failure_keeps_readable_private_wavs_and_stops(self):
        self.transport.open.side_effect = ProviderFailure('test')
        self.session.run()
        self.assertFalse(self.result[0]['confirmed']); self.assertEqual(self.session.state, 'failed')
        for name in ('learner.wav', 'customer.wav'):
            path = Path(self.directory.name) / name
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with wave.open(str(path)) as audio: self.assertEqual(audio.getframerate(), 24000)

    def test_browser_disconnect_sends_close_and_does_not_reconnect(self):
        count = [0]
        def receive(**kwargs):
            count[0] += 1
            if count[0] == 1:
                self.clock.return_value = 1
                return {'type': 'session.started', 'session': conversation_config({}, {})}
            if count[0] == 2:
                self.clock.return_value = 10
                return None
            return {'type': 'session.closed', 'usage': {'seconds': 10}}
        self.transport.receive.side_effect = receive
        self.session.run()
        self.assertEqual(self.result[0]['stop_reason'], 'browser_disconnected')
        self.assertEqual(self.transport.open.call_count, 1)
        self.assertEqual(sum(c.args[0]['type'] == 'session.close' for c in self.transport.send.call_args_list), 1)

    def test_transport_error_hides_native_exception_and_secret(self):
        secret = ServerSecret('sk-fictional-sensitive-marker')
        self.assertNotIn('sensitive-marker', repr(secret))
        with patch('training.live_provider.connect', side_effect=RuntimeError(secret.authorization())):
            with self.assertRaises(ProviderFailure) as error: OpenAILiveTransport(secret).open({})
        self.assertNotIn('sensitive-marker', str(error.exception))

    def test_idle_cutoff_closes_even_when_browser_keeps_polling(self):
        events = [0]
        def receive(**kwargs):
            events[0] += 1
            if events[0] == 1:
                self.clock.return_value = 1
                return {'type':'session.started','session':conversation_config({}, {})}
            if events[0] == 2:
                self.clock.return_value = 32
                self.session.last_contact = 32
                return None
            return {'type':'session.closed','usage':{'seconds':33}}
        self.transport.receive.side_effect = receive
        self.session.run()
        self.assertEqual(self.result[0]['stop_reason'], 'idle_timeout')
        self.assertEqual(sum(c.args[0]['type']=='session.close' for c in self.transport.send.call_args_list),1)

    def test_active_call_cutoff_cannot_be_extended_by_audio_or_browser_activity(self):
        events = [0]
        def receive(**kwargs):
            events[0] += 1
            if events[0] == 1:
                self.clock.return_value = 1
                return {'type':'session.started','session':conversation_config({}, {})}
            if events[0] == 2:
                self.clock.return_value = 241
                self.session.last_contact = self.session.last_activity = 241
                return None
            return {'type':'session.closed','usage':{'seconds':242}}
        self.transport.receive.side_effect = receive
        self.session.run()
        self.assertEqual(self.result[0]['stop_reason'], 'session_limit')
        self.assertEqual(self.transport.open.call_count,1)

    def test_keychain_failure_is_generic_no_fallback(self):
        # Inert keychain path: the test must never query the OS Keychain or security CLI.
        with patch('training.live_credentials.login_keychain', return_value=Path('/nonexistent/inert-test.keychain-db')), \
                patch('training.live_credentials.c.CDLL', side_effect=RuntimeError('private detail')):
            with self.assertRaises(CredentialUnavailable) as error: read_project_key()
        self.assertNotIn('private detail', str(error.exception))


class LiveViewTests(PilotCase):
    def setUp(self):
        self.sign_as()
        Assignment.objects.filter(pk=self.assignment.pk).update(welcome_completed_at=timezone.now(), lesson_completed_at=timezone.now())
        self.controller = Mock(armed=True, sessions={}, input_mode='synthetic', assignment_id=None,
                               budget=SimpleNamespace(approval='andrew-2026-10-07T20:08Z'))
        self.controller.start.side_effect = lambda call: None
        self.patcher = patch('training.live_views.controller', self.controller)
        self.patcher.start(); self.addCleanup(self.patcher.stop)

    def begin(self):
        response = self.client.post(reverse('live_start', args=[self.assignment.pk]),
            json.dumps({'consent': True, 'input_mode': 'synthetic'}), content_type='application/json')
        self.assertEqual(response.status_code, 201)
        return Attempt.objects.get(pk=response.json()['attempt_id'])

    def test_start_twice_opens_only_one_provider_connection(self):
        attempt = self.begin()
        response = self.client.post(reverse('live_start', args=[self.assignment.pk]),
            json.dumps({'consent': True, 'input_mode': 'synthetic'}), content_type='application/json')
        self.assertTrue(response.json()['duplicate'])
        self.assertEqual(self.controller.start.call_count, 1)
        self.assertEqual(Attempt.objects.count(), 1)

    def test_disabled_mode_never_calls_provider(self):
        self.controller.armed = False
        response = self.client.post(reverse('live_start', args=[self.assignment.pk]), '{}', content_type='application/json')
        self.assertEqual(response.status_code, 409); self.controller.start.assert_not_called()

    def test_no_physical_mic_mode_authorized(self):
        response = self.client.post(reverse('live_start', args=[self.assignment.pk]),
            json.dumps({'consent': True, 'input_mode': 'microphone'}), content_type='application/json')
        self.assertEqual(response.status_code, 400); self.controller.start.assert_not_called()

    def test_staff_cannot_start_and_csrf_required(self):
        for user in (self.trainer, self.admin):
            self.sign_as(user)
            self.assertEqual(self.client.post(reverse('live_start', args=[self.assignment.pk])).status_code, 403)
        client = Client(enforce_csrf_checks=True); client.force_login(self.learner)
        self.assertEqual(client.post(reverse('live_start', args=[self.assignment.pk])).status_code, 403)

    def test_pages_render_and_microphone_is_denied(self):
        response = self.client.get(reverse('live_prepare', args=[self.assignment.pk]))
        self.assertContains(response, 'Start test call')
        self.assertIn('microphone=()', response['Permissions-Policy'])
        attempt = self.begin()
        self.assertContains(self.client.get(reverse('live_detail', args=[attempt.pk])), 'Practice handoff')

    def test_scripted_mutation_cannot_inject_live_evidence(self):
        attempt = self.begin()
        self.assertEqual(self.mutate(attempt, op='turn', action='close').status_code, 409)
        attempt.refresh_from_db(); self.assertEqual(attempt.actions, [])

    def test_saved_audio_is_private_and_foreign_learner_denied(self):
        from django.contrib.auth import get_user_model
        from .models import Profile
        attempt = self.begin()
        LiveCall.objects.filter(pk=attempt.pk).update(state='closed')
        with tempfile.TemporaryDirectory() as directory, override_settings(LIVE_RECORDING_DIR=directory):
            target = Path(directory) / str(attempt.pk); target.mkdir()
            recording = TimelineAudio(target / 'learner.wav'); recording.append(b'\0\0' * 240, 0); recording.close()
            url = reverse('live_audio', args=[attempt.pk, 'learner'])
            response = self.client.get(url); self.assertEqual(response.status_code, 200); response.close()
            other = get_user_model().objects.create_user('other', email='other@example.invalid')
            Profile.objects.create(user=other, role='learner', invited=True)
            self.sign_as(other); self.assertEqual(self.client.get(url).status_code, 403)
            self.sign_as(self.trainer); response = self.client.get(url)
            self.assertEqual(response.status_code, 200); self.assertEqual(response['Cache-Control'], 'no-store'); response.close()

    def test_review_validation_retains_bound_form(self):
        attempt = self.begin(); attempt.status = 'submitted'; attempt.feedback = build_feedback(attempt); attempt.save()
        self.sign_as(self.trainer)
        response = self.client.post(reverse('review', args=[attempt.pk]), {'decision': 'ready'})
        self.assertEqual(response.status_code, 200); self.assertContains(response, 'This field is required')
        self.assertFalse(Review.objects.exists())

    def test_unconfirmed_finalization_preserves_evidence_without_grading(self):
        attempt = self.begin()
        with tempfile.TemporaryDirectory() as directory, override_settings(LIVE_RECORDING_DIR=directory):
            engine = LiveController(); engine.arm(ServerSecret('sk-fake-only'), TestBudget(directory)); engine.budget.reserve(str(attempt.pk))
            result = {'confirmed': False, 'usage_seconds': None, 'error_code': 'network_lost',
                'local_elapsed_seconds': 10, 'fragments': [{'speaker': 'learner', 'text': 'Hello', 'start_ms': 0, 'end_ms': 500}]}
            with patch('training.live_runtime.request_coaching') as grading:
                engine.finalize(str(attempt.pk), result)
            grading.assert_not_called(); self.assertFalse(engine.armed)
            attempt.refresh_from_db(); self.assertEqual(attempt.status, 'submitted')
            self.assertIsNone(UsageEntry.objects.get().reported_cents)
            self.assertTrue((Path(directory) / str(attempt.pk) / 'evidence.json').is_file())

    def test_grounding_rejects_invented_citations_and_customer_policy_claims(self):
        attempt = self.begin()
        attempt.transcript = [{'id': 'live-1', 'speaker': 'Customer', 'text': 'Can you waive the deep?'}]
        report = {'observations': [{'title': CATEGORIES[0], 'status': 'observed', 'evidence_ids': ['invented'], 'coaching': 'Test'}],
                  'policy_flags': [{'evidence_id': 'live-1', 'exact_quote': 'waive the deep', 'issue': 'waiver'}]}
        feedback = build_feedback(attempt, report)
        self.assertEqual(feedback['policy_flags'], []); self.assertEqual(feedback['observations'][0]['evidence_ids'], [])
        self.assertIsNone(feedback['automatic_pass'])
        self.assertNotEqual(feedback['outcome']['code'], 'qualified_request')

    def test_coaching_request_is_bounded_and_text_only(self):
        attempt = self.begin()
        payload = json.loads(coaching_payload(attempt))
        self.assertFalse(payload['store']); self.assertEqual(payload['max_output_tokens'], 2400)
        self.assertNotIn('tools', payload); self.assertIn('do not assess cadence', payload['instructions'])
        attempt.transcript = [{'speaker': 'Learner', 'text': 'x' * 49000}]
        with self.assertRaises(ProviderFailure): coaching_payload(attempt)

    def test_coaching_excludes_local_crm_actions_and_nonspoken_metadata(self):
        attempt = self.begin()
        attempt.crm = {'customer': 'LOCAL-CRM-MARKER'}
        attempt.actions = [{'code': 'LOCAL-ACTION-MARKER'}]
        attempt.policy = {'private': 'LOCAL-POLICY-MARKER'}
        attempt.transcript = [
            {'id': 'live-1', 'speaker': 'Learner', 'text': 'Fictional spoken words', 'private': 'LOCAL-METADATA-MARKER'},
            {'id': 'crm-1', 'speaker': 'Practice CRM', 'text': 'LOCAL-NOTE-MARKER'},
        ]
        payload = coaching_payload(attempt)
        self.assertNotIn(b'LOCAL-', payload)
        self.assertEqual(json.loads(json.loads(payload)['input']), {'transcript': [
            {'id': 'live-1', 'speaker': 'Learner', 'text': 'Fictional spoken words'}]})

    def technical_failure(self):
        attempt = self.begin()
        attempt.status = 'submitted'
        attempt.transcript = [{'id': 'live-1', 'speaker': 'Customer', 'text': 'Fictional greeting'}]
        attempt.save()
        LiveCall.objects.filter(pk=attempt.pk).update(state='closed',
            usage={'voice_seconds': 117.0, 'final_confirmed': True, 'grading': None},
            evidence={'post_test_verification': {'technical_issue': 'silent_prerecorded_fixture'}})
        return attempt

    def retry_budget(self, directory, attempt):
        budget = TestBudget(directory)
        budget.arm(); budget.reserve(str(attempt.pk)); budget.voice_closed(str(attempt.pk), 117.0)
        budget.finish(str(attempt.pk), confirmed=True); budget.close()
        return budget

    def test_technical_retry_preserves_evidence_without_manager_decision(self):
        from .live_retry import prepare_silent_fixture_retry
        attempt = self.technical_failure()
        transcript = attempt.transcript
        with tempfile.TemporaryDirectory() as directory:
            budget = self.retry_budget(directory, attempt)
            prepare_silent_fixture_retry(budget, attempt.pk, 'Approved corrected test')
            attempt.refresh_from_db()
            self.assertEqual(attempt.status, 'abandoned')
            self.assertEqual(attempt.transcript, transcript)
            self.assertFalse(Review.objects.filter(attempt=attempt).exists())
            self.assertFalse(attempt.live_call.evidence['post_test_verification']['technical_retry']['manager_readiness_assessed'])
            self.assertNotEqual(self.begin().pk, attempt.pk)

    def test_technical_retry_cannot_bypass_review_of_spoken_performance(self):
        from .live_retry import prepare_silent_fixture_retry
        attempt = self.technical_failure()
        attempt.transcript.append({'id': 'live-2', 'speaker': 'Learner', 'text': 'Actual practice words'})
        attempt.save()
        with tempfile.TemporaryDirectory() as directory:
            budget = self.retry_budget(directory, attempt)
            before = budget.summary()
            with self.assertRaises(BudgetDenied): prepare_silent_fixture_retry(budget, attempt.pk, 'Approved')
            self.assertEqual(budget.summary(), before)
            attempt.refresh_from_db(); self.assertEqual(attempt.status, 'submitted')

    def test_technical_retry_requires_matching_confirmed_duration(self):
        from .live_retry import prepare_silent_fixture_retry
        attempt = self.technical_failure()
        LiveCall.objects.filter(pk=attempt.pk).update(usage={'voice_seconds': 118.0, 'final_confirmed': True, 'grading': None})
        with tempfile.TemporaryDirectory() as directory:
            budget = self.retry_budget(directory, attempt)
            with self.assertRaises(BudgetDenied): prepare_silent_fixture_retry(budget, attempt.pk, 'Approved')
            self.assertTrue(budget.summary()['closed'])
