import copy
import json
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import Client, TestCase, SimpleTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from .authentication import consume_link, digest, issue_link
from .evaluation import validate_outcome
from .models import Assignment, Attempt, BudgetSettings, MagicLink, OperatingCost, Profile, Review, UsageEntry
from .policies import POLICY, quote, requires_reset
from .providers import LocalVoice, PreviewEmail, ProviderDisabled
from .usage import record_usage, summarize


class PricingTests(SimpleTestCase):
    def test_approved_2000_prices(self):
        self.assertEqual({s: quote(s, 2000)['total'] for s in POLICY['services']},
                         {'monthly': 265, 'biweekly': 220, 'weekly': 200, 'deep': 570, 'move': 620})

    def test_minimums_and_rounding(self):
        for service, amount in [('monthly',150), ('biweekly',110), ('weekly',110), ('deep',325), ('move',400)]:
            self.assertEqual(quote(service, 1)['total'], amount)
        self.assertEqual(quote('deep', 2001)['total'], 570)
        self.assertEqual(quote('deep', 2012)['total'], 575)

    def test_move_extras_included(self):
        self.assertEqual(quote('move', 2000, ['oven','fridge','dishwasher','cabinets'])['total'], 620)
        self.assertEqual(quote('deep', 2000, ['oven','fridge','dishwasher','cabinets'])['total'], 760)

    def test_manual_walkthrough_boundary(self):
        self.assertFalse(quote('deep', 4000)['manual'])
        self.assertTrue(quote('deep', 4001)['manual'])
        self.assertNotIn('total', quote('deep', 4001))

    def test_recurring_never_waives_deep(self):
        for service in ['weekly','biweekly','monthly']:
            self.assertEqual(quote(service, 2000)['initial_deep'], 570)

    def test_unresolved_and_invalid_inputs_rejected(self):
        for args in [('deep',0), ('quarterly',2000), ('deep',True), ('deep',2000,['windows']),
                     ('deep',2000,['freezer']), ('biweekly',2000,['oven']), ('deep',2000,['oven','oven'])]:
            with self.assertRaises(ValueError):
                quote(*args)

    def test_latest_owner_policies(self):
        self.assertTrue(POLICY['residential_only'])
        self.assertEqual(POLICY['cancellation_notice_hours'], 48)
        self.assertFalse(requires_reset(30))
        self.assertTrue(requires_reset(31))
        with self.assertRaises(ValueError):
            requires_reset(-1)


class PilotCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', verbosity=0)
        cls.learner = get_user_model().objects.get(email='learner@example.invalid')
        cls.trainer = get_user_model().objects.get(email='trainer@example.invalid')
        cls.admin = get_user_model().objects.get(email='admin@example.invalid')
        cls.assignment = Assignment.objects.get(learner=cls.learner)

    def sign_as(self, user=None):
        self.client.force_login(user or self.learner)

    def prepare(self):
        self.sign_as()
        Assignment.objects.filter(pk=self.assignment.pk).update(welcome_completed_at=timezone.now(), lesson_completed_at=timezone.now())
        response = self.client.post(reverse('start', args=[self.assignment.pk]))
        self.assertEqual(response.status_code, 302)
        return Attempt.objects.order_by('-started_at').first()

    def mutate(self, attempt, **data):
        attempt.refresh_from_db()
        return self.client.post(reverse('mutate_attempt', args=[attempt.pk]), {'revision': attempt.revision, **data})

    def crm(self, attempt, **overrides):
        data = dict(op='crm', customer='Taylor Sample', sqft=2000, service='biweekly', needs='Kitchen buildup and bathrooms',
                    initial_quote=570, recurring_quote=220, disposition='request', follow_up='Team to confirm availability; requested next week.', reason='')
        return self.mutate(attempt, **(data | overrides))

    def complete(self, attempt):
        for code in ['discover','value','explain','objection']:
            self.assertEqual(self.mutate(attempt, op='turn', action=code).status_code, 302)
        self.assertEqual(self.crm(attempt).status_code, 302)
        self.mutate(attempt, op='turn', action='close')
        self.mutate(attempt, op='submit')
        attempt.refresh_from_db()
        return attempt


class AuthenticationTests(PilotCase):
    def test_seed_has_no_owner_or_usable_passwords(self):
        self.assertEqual(get_user_model().objects.count(), 3)
        self.assertTrue(all(not u.has_usable_password() for u in get_user_model().objects.all()))
        self.assertFalse(get_user_model().objects.filter(is_superuser=True).exists())

    def test_uninvited_real_email_cannot_issue(self):
        response = self.client.post(reverse('sign_in'), {'email':'someone@real-company.com'})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.context['preview'])
        self.assertEqual(MagicLink.objects.count(), 0)

    def test_invitation_revoked(self):
        self.learner.profile.invited = False
        self.learner.profile.save()
        self.assertIsNone(issue_link(self.learner))

    def test_link_is_hashed_and_single_use(self):
        preview = issue_link(self.learner)
        token = preview['url'].split('#')[1]
        link = MagicLink.objects.get()
        self.assertEqual(link.digest, digest(token))
        self.assertNotIn(token, json.dumps(list(MagicLink.objects.values()), default=str))
        self.assertEqual(consume_link(token).pk, self.learner.pk)
        self.assertIsNone(consume_link(token))

    def test_expired_token_rejected(self):
        preview = issue_link(self.learner)
        MagicLink.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertIsNone(consume_link(preview['url'].split('#')[1]))

    def test_revocation_after_issue_rejected(self):
        preview = issue_link(self.learner)
        Profile.objects.filter(user=self.learner).update(invited=False)
        self.assertIsNone(consume_link(preview['url'].split('#')[1]))

    def test_scanner_get_does_not_consume(self):
        response = self.client.post(reverse('sign_in'), {'email':self.learner.email})
        token = response.context['preview']['url'].split('#')[1]
        for _ in range(2):
            self.assertEqual(self.client.get(reverse('magic')).status_code, 200)
        self.assertIsNone(MagicLink.objects.get().used_at)
        self.assertNotIn('_auth_user_id', self.client.session)
        response = self.client.post(reverse('magic'), {'token':token})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(int(self.client.session['_auth_user_id']), self.learner.pk)
        self.assertEqual(self.client.post(reverse('magic'), {'token':token}).status_code, 400)

    def test_different_browser_cannot_consume_preview(self):
        response = self.client.post(reverse('sign_in'), {'email':self.learner.email})
        token = response.context['preview']['url'].split('#')[1]
        self.assertEqual(Client().post(reverse('magic'), {'token':token}).status_code, 400)
        self.assertIsNone(MagicLink.objects.get().used_at)

    def test_csrf_protects_confirmation_and_mutation(self):
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(client.post(reverse('magic'), {'token':'fake'}).status_code, 403)
        client.force_login(self.learner)
        self.assertEqual(client.post(reverse('start', args=[self.assignment.pk])).status_code, 403)

    def test_csrf_accepts_same_origin_and_rejects_null_origin(self):
        client = Client(enforce_csrf_checks=True)
        response = client.get(reverse('sign_in'))
        self.assertEqual(response['Referrer-Policy'], 'same-origin')
        token = client.cookies[settings.CSRF_COOKIE_NAME].value
        payload = {'email':self.learner.email,'csrfmiddlewaretoken':token}
        self.assertEqual(client.post(reverse('sign_in'), payload, HTTP_ORIGIN='http://testserver').status_code,200)
        self.assertEqual(client.post(reverse('sign_in'), payload, HTTP_ORIGIN='null').status_code,403)

    def test_head_scanner_cannot_consume_token(self):
        issue_link(self.learner)
        self.assertEqual(self.client.head(reverse('magic')).status_code,405)
        self.assertIsNone(MagicLink.objects.get().used_at)

    def test_sign_in_rate_limit(self):
        for _ in range(5):
            self.assertIsNotNone(issue_link(self.learner))
        self.assertIsNone(issue_link(self.learner))
        self.assertEqual(MagicLink.objects.count(), 5)

    def test_signout_is_post_only(self):
        self.sign_as()
        self.assertEqual(self.client.get(reverse('sign_out')).status_code, 405)

    def test_no_raw_token_persisted_in_session(self):
        response = self.client.post(reverse('sign_in'), {'email':self.learner.email})
        token = response.context['preview']['url'].split('#')[1]
        self.assertNotIn(token, json.dumps(dict(self.client.session)))
        self.assertContains(response, '/magic/#')
        self.assertNotContains(response, '?token=')


class AccessAndIsolationTests(PilotCase):
    def test_anonymous_is_redirected(self):
        self.assertEqual(self.client.get('/').status_code, 302)

    def test_other_learners_cannot_read_or_modify_attempts(self):
        attempt = self.prepare()
        other = get_user_model().objects.create_user(username='other@example.invalid')
        Profile.objects.create(user=other, role='learner')
        self.sign_as(other)
        for name, pk in [('attempt',attempt.pk), ('course',self.assignment.pk), ('welcome',self.assignment.pk)]:
            self.assertEqual(self.client.get(reverse(name,args=[pk])).status_code, 403)
        self.assertEqual(self.mutate(attempt,op='submit').status_code, 403)

    def test_learner_cannot_review_assign_or_read_costs(self):
        attempt = self.prepare()
        for url in [reverse('review',args=[attempt.pk]),reverse('assign'),reverse('costs')]:
            self.assertEqual(self.client.post(url,{}).status_code, 403)
        self.assertEqual(self.client.get(reverse('costs')).status_code, 403)

    def test_trainer_can_review_but_not_edit_or_view_costs(self):
        attempt = self.prepare()
        self.sign_as(self.trainer)
        self.assertEqual(self.client.get(reverse('attempt',args=[attempt.pk])).status_code, 200)
        self.assertEqual(self.mutate(attempt,op='turn',action='discover').status_code,403)
        self.assertEqual(self.client.get(reverse('costs')).status_code,403)
        self.assertEqual(self.client.post(reverse('costs'),{'op':'budget','monthly_target_cents':99999}).status_code,403)

    def test_admin_can_manage_costs_and_assign(self):
        self.sign_as(self.admin)
        self.assertEqual(self.client.get(reverse('costs')).status_code,200)
        self.assertEqual(self.client.post(reverse('assign'),{'learner':self.learner.pk,'course':self.assignment.course_id}).status_code,302)
        self.assertEqual(Assignment.objects.count(),1)

    def test_revoked_profile_denied_existing_session(self):
        self.sign_as()
        Profile.objects.filter(user=self.learner).update(invited=False)
        self.assertEqual(self.client.get('/').status_code,403)

    def test_only_loopback_and_no_recording_permissions(self):
        self.assertEqual(self.client.get('/sign-in/', REMOTE_ADDR='192.168.1.20').status_code,403)
        self.assertEqual(self.client.get('/sign-in/', HTTP_HOST='evil.invalid').status_code,400)
        response = self.client.get('/sign-in/')
        self.assertEqual(response['Cache-Control'],'no-store')
        self.assertIn('microphone=()',response['Permissions-Policy'])
        self.assertIn('display-capture=()',response['Permissions-Policy'])
        self.assertIn("connect-src 'self'",response['Content-Security-Policy'])

    def test_database_and_source_are_not_served(self):
        for path in ['/.data/pilot.sqlite3','/manage.py','/.env','/static/../../.data/pilot.sqlite3']:
            self.assertIn(self.client.get(path).status_code,{400,404})

    def test_project_is_self_contained(self):
        self.assertEqual(settings.DATA_DIR.parent,settings.BASE_DIR)
        self.assertEqual(settings.BASE_DIR.name,'lemon-lavender-pilot')
        self.assertEqual(set(settings.ALLOWED_HOSTS),{'127.0.0.1','localhost','[::1]','testserver'})
        self.assertFalse(settings.DEBUG)
        self.assertEqual(settings.SESSION_COOKIE_NAME, 'll_pilot_session')
        self.assertEqual(settings.CSRF_COOKIE_NAME, 'll_pilot_csrf')


class PracticeTests(PilotCase):
    def test_welcome_required_before_sales_lesson(self):
        self.sign_as()
        self.assertRedirects(self.client.get(reverse('lesson',args=[self.assignment.pk])),reverse('welcome',args=[self.assignment.pk]))
        self.assertEqual(self.client.post(reverse('start',args=[self.assignment.pk])).status_code,409)

    def test_welcome_checks_retry_and_intro_saved(self):
        self.sign_as()
        url = reverse('welcome',args=[self.assignment.pk])
        data = {'clock':'fixed','deep':'required','booking':'request','introduction':'Welcome to Lemon and Lavender. We provide home cleaning, including deep cleaning and weekly visits. What do you need help with?'}
        self.assertEqual(self.client.post(url,data).status_code,200)
        self.assignment.refresh_from_db()
        self.assertIsNone(self.assignment.welcome_completed_at)
        data['clock']='pacific'
        self.assertEqual(self.client.post(url,data).status_code,302)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.company_introduction,data['introduction'])
        self.assertIsNotNone(self.assignment.welcome_completed_at)

    def test_start_is_idempotent_and_draft_resumes(self):
        attempt = self.prepare()
        self.mutate(attempt,op='turn',action='discover')
        response = self.client.post(reverse('start',args=[self.assignment.pk]))
        self.assertEqual(response.url,reverse('attempt',args=[attempt.pk]))
        self.assertEqual(Attempt.objects.count(),1)
        attempt.refresh_from_db()
        self.assertEqual(len(attempt.transcript),3)
        self.assertContains(self.client.get(response.url),'two thousand square feet')

    def test_repeated_and_stale_actions_do_not_duplicate_evidence_or_usage(self):
        attempt = self.prepare()
        url = reverse('mutate_attempt',args=[attempt.pk])
        payload = {'revision':0,'op':'turn','action':'discover'}
        self.client.post(url,payload)
        self.client.post(url,payload)
        attempt.refresh_from_db()
        self.assertEqual(attempt.revision,1)
        self.assertEqual(len(attempt.actions),1)
        self.assertEqual(UsageEntry.objects.filter(attempt=attempt).count(),2)

    def test_closing_too_early_does_not_get_customer_agreement(self):
        attempt = self.prepare()
        self.mutate(attempt,op='turn',action='close')
        attempt.refresh_from_db()
        self.assertEqual(attempt.transcript[-1]['clip'],'close_missing')

    def test_complete_flow_evidence_review_and_retry(self):
        attempt = self.complete(self.prepare())
        self.assertEqual(attempt.feedback['outcome']['code'],'qualified_request')
        self.assertIsNone(attempt.feedback['automatic_pass'])
        self.assertFalse(attempt.feedback['outcome']['booking_confirmed'])
        self.assertFalse(attempt.feedback['outcome']['deposit_paid'])
        self.assertFalse(attempt.feedback['outcome']['quote_approved'])
        self.assertTrue(attempt.feedback['outcome']['commitment_evidence'])
        self.assertEqual(self.client.post(reverse('start',args=[self.assignment.pk])).status_code,409)
        old_transcript = copy.deepcopy(attempt.transcript)
        self.mutate(attempt,op='turn',action='discover')
        attempt.refresh_from_db()
        self.assertEqual(attempt.transcript,old_transcript)
        self.sign_as(self.trainer)
        self.assertEqual(self.client.post(reverse('review',args=[attempt.pk]),{
            'decision':'ready','coaching':'State the requested date as awaiting team confirmation.',
            'objection_evidence':next(e['evidence'] for e in attempt.actions if e['code']=='objection')+' explains why the first deep costs more.',
            'override_reason':'Reviewed the action evidence and company introduction; ready for more supervised practice.'}).status_code,302)
        self.assertEqual(Review.objects.get().reviewer,self.trainer)
        self.sign_as()
        self.client.post(reverse('start',args=[self.assignment.pk]))
        self.assertEqual(Attempt.objects.count(),2)
        attempt.refresh_from_db()
        self.assertEqual(attempt.transcript,old_transcript)

    def test_invented_policy_never_passes(self):
        for code in ['discount','waive','falsebook']:
            with self.subTest(code=code):
                attempt = self.prepare()
                self.mutate(attempt,op='turn',action=code)
                self.complete(attempt)
                self.assertEqual(attempt.feedback['outcome']['code'],'policy_correction_required')
                self.sign_as(self.trainer)
                self.assertEqual(self.client.post(reverse('review',args=[attempt.pk]),{
                    'decision':'ready','coaching':'This needs a corrected statement.', 'override_reason':'Attempting override'}).status_code,409)
                self.client.post(reverse('review',args=[attempt.pk]),{'decision':'retry','coaching':'Repeat without inventing a policy exception.'})

    def test_legitimate_escalation(self):
        attempt = self.prepare()
        self.mutate(attempt,op='turn',action='discover')
        self.mutate(attempt,op='turn',action='escalate')
        self.crm(attempt,disposition='escalation',reason='Customer needs manager clarification about deposit terms.')
        self.mutate(attempt,op='submit')
        attempt.refresh_from_db()
        self.assertEqual(attempt.feedback['outcome']['code'],'escalation_for_review')
        self.sign_as(self.trainer)
        response = self.client.post(reverse('review',args=[attempt.pk]),{'decision':'escalation',
            'coaching':'Record the exact unanswered policy question.', 'override_reason':'Payment terms are unresolved; escalation is appropriate.'})
        self.assertEqual(response.status_code,302)

    def test_incorrect_crm_quote_prevents_commitment(self):
        attempt = self.prepare()
        for code in ['discover','value','explain','objection']:
            self.mutate(attempt,op='turn',action=code)
        self.crm(attempt,initial_quote=0)
        self.mutate(attempt,op='turn',action='close')
        attempt.refresh_from_db()
        self.assertEqual(attempt.transcript[-1]['clip'],'close_missing')

    def test_discovery_must_precede_price_and_saved_quote(self):
        attempt = self.prepare()
        self.assertEqual(self.crm(attempt).status_code,409)
        for code in ['explain','discover','value','objection']:
            self.mutate(attempt,op='turn',action=code)
        self.crm(attempt)
        self.mutate(attempt,op='turn',action='close')
        attempt.refresh_from_db()
        self.assertEqual(attempt.transcript[-1]['clip'],'close_missing')

    def test_tampering_and_html_escaping(self):
        attempt = self.prepare()
        self.assertEqual(self.mutate(attempt,op='turn',action='hacked').status_code,400)
        self.mutate(attempt,op='turn',action='discover')
        self.crm(attempt,needs='<script>alert("test")</script>')
        response = self.client.get(reverse('attempt',args=[attempt.pk]))
        self.assertNotContains(response,'<script>alert(')
        self.assertContains(response,'&lt;script&gt;')

    def test_no_manager_rewrite_of_final_review(self):
        attempt = self.complete(self.prepare())
        self.sign_as(self.trainer)
        data={'decision':'retry','coaching':'Ask for explicit next-step permission every time.'}
        self.client.post(reverse('review',args=[attempt.pk]),data)
        self.assertEqual(self.client.post(reverse('review',args=[attempt.pk]),data).status_code,409)
        self.assertEqual(Review.objects.count(),1)

    def test_policy_scenario_rubric_snapshot(self):
        attempt = self.prepare()
        original = copy.deepcopy(attempt.policy)
        with patch.dict(POLICY, {'version':'next-policy','cancellation_notice_hours':999}):
            attempt.refresh_from_db()
            self.assertEqual(attempt.policy,original)
        self.assertEqual(attempt.policy['cancellation_notice_hours'],48)
        self.assertIn('version',attempt.scenario)
        self.assertIn('version',attempt.rubric)

    def test_expired_attempt_preserved_and_retry_available(self):
        attempt = self.prepare()
        self.mutate(attempt,op='turn',action='discover')
        Attempt.objects.filter(pk=attempt.pk).update(started_at=timezone.now()-timedelta(minutes=21))
        self.mutate(attempt,op='turn',action='value')
        attempt.refresh_from_db()
        self.assertEqual(attempt.status,'expired')
        self.assertEqual(len(attempt.actions),1)
        self.client.post(reverse('start',args=[self.assignment.pk]))
        self.assertEqual(Attempt.objects.count(),2)

    def test_abandoned_attempt_keeps_evidence(self):
        attempt = self.prepare()
        self.mutate(attempt,op='turn',action='discover')
        self.mutate(attempt,op='abandon')
        attempt.refresh_from_db()
        self.assertEqual(attempt.status,'abandoned')
        self.assertEqual(len(attempt.actions),1)

    @override_settings(MAX_ATTEMPTS_PER_DAY=1)
    def test_daily_budget_session_limit(self):
        attempt = self.prepare()
        self.mutate(attempt,op='abandon')
        self.assertEqual(self.client.post(reverse('start',args=[self.assignment.pk])).status_code,429)

    @override_settings(MAX_TURNS=1)
    def test_turn_limit_allows_submission(self):
        attempt = self.prepare()
        self.mutate(attempt,op='turn',action='discover')
        self.assertEqual(self.mutate(attempt,op='turn',action='value').status_code,429)
        self.assertEqual(self.mutate(attempt,op='submit').status_code,302)

    def test_no_live_provider_can_be_selected(self):
        with override_settings(VOICE_PROVIDER='paid'):
            with self.assertRaises(ProviderDisabled):
                LocalVoice().audio_url('opening')
        with override_settings(EMAIL_PROVIDER='smtp'):
            with self.assertRaises(ProviderDisabled):
                PreviewEmail().deliver_link('learner@example.invalid','token')
        with override_settings(PROVIDER_SPEND_LIMIT_CENTS=1):
            with self.assertRaises(ProviderDisabled):
                LocalVoice().audio_url('opening')

    def test_audio_fixture_and_transcript_available(self):
        attempt = self.prepare()
        self.assertContains(self.client.get(reverse('attempt',args=[attempt.pk])),'audio controls')
        path = LocalVoice().audio_url('opening')
        response = self.client.get(path)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response['Content-Type'],'audio/x-wav')
        response.close()


class CostTests(PilotCase):
    def test_mock_usage_is_free_and_idempotent(self):
        attempt = self.prepare()
        record_usage(attempt,'opening_fixture','opening')
        self.assertEqual(UsageEntry.objects.count(),1)
        usage=UsageEntry.objects.get()
        self.assertTrue(usage.synthetic)
        self.assertEqual(usage.estimated_cents,0)
        self.assertEqual(usage.reported_cents,0)
        self.assertGreater(usage.voice_seconds,0)
        self.assertEqual(summarize()['month_reported'],Decimal('0.00'))

    def test_synthetic_nonzero_charges_rejected(self):
        attempt = self.prepare()
        with self.assertRaises(IntegrityError), transaction.atomic():
            UsageEntry.objects.create(attempt=attempt,user=self.learner,event_key='impossible',
                                      activity='grading',synthetic=True,estimated_cents=1,reported_cents=1)

    def test_month_daily_and_employee_session_aggregation(self):
        attempt = self.prepare()
        UsageEntry.objects.create(attempt=attempt,user=self.learner,event_key='live-1',activity='grading',synthetic=False,
                                  provider='test-only',model='example',estimated_cents=100,reported_cents=120,price_version='test-price-v1')
        UsageEntry.objects.create(attempt=attempt,user=self.learner,event_key='live-2',activity='transcription',synthetic=False,
                                  provider='test-only',estimated_cents=50,reported_cents=None)
        old=UsageEntry.objects.create(attempt=attempt,user=self.learner,event_key='old',activity='grading',synthetic=False,
                                      estimated_cents=900,reported_cents=900)
        UsageEntry.objects.filter(pk=old.pk).update(recorded_at=timezone.now().replace(day=1)-timedelta(days=1))
        OperatingCost.objects.create(month=timezone.localdate().replace(day=1),category='hosting',cents=800,note='Test manual expense',entered_by=self.admin)
        result=summarize()
        self.assertEqual(result['month_estimate'],Decimal('1.50'))
        self.assertEqual(result['month_reported'],Decimal('1.20'))
        self.assertEqual(result['day_reported'],Decimal('1.20'))
        self.assertEqual(result['operating_dollars'],Decimal('8.00'))
        self.assertEqual(result['unreported'],1)
        self.assertEqual(result['month_events'],3)
        self.assertEqual(len(result['by_employee']),2)
        self.assertEqual(len(result['by_session']),2)

    def test_alert_uses_separate_estimated_or_reported_basis(self):
        attempt=self.prepare()
        BudgetSettings.objects.create(pk=1,monthly_target_cents=5000,alert_percent=80)
        UsageEntry.objects.create(attempt=attempt,user=self.learner,event_key='threshold',activity='voice',synthetic=False,
                                  estimated_cents=4000,reported_cents=None)
        self.assertTrue(summarize()['alert'])
        self.assertEqual(summarize()['month_reported'],Decimal('0.00'))

    def test_admin_limits_apply_to_new_attempts(self):
        self.sign_as(self.admin)
        data={'op':'budget','monthly_target_cents':5000,'alert_percent':80,'max_attempts_per_day':1,'max_minutes':3,'max_turns':2}
        self.assertEqual(self.client.post(reverse('costs'),data).status_code,302)
        attempt=self.prepare()
        self.assertEqual(attempt.limits,{'minutes':3,'turns':2,'daily_attempts':1})
        self.mutate(attempt,op='turn',action='discover')
        self.mutate(attempt,op='turn',action='value')
        self.assertEqual(self.mutate(attempt,op='turn',action='explain').status_code,429)

    def test_budget_settings_cannot_enable_spending(self):
        self.sign_as(self.admin)
        data={'op':'budget','monthly_target_cents':5000,'alert_percent':101,'max_attempts_per_day':10,'max_minutes':20,'max_turns':24}
        response=self.client.post(reverse('costs'),data)
        self.assertContains(response,'Choose a value from 1 to 100')
        self.assertFalse(BudgetSettings.objects.exists())
        self.assertEqual(settings.PROVIDER_SPEND_LIMIT_CENTS,0)

    def test_manual_cost_is_separate_and_audited(self):
        self.sign_as(self.admin)
        response=self.client.post(reverse('costs'),{'op':'operating','month':'2026-10-20','category':'email','cents':250,'note':'Test-only manual record'})
        self.assertEqual(response.status_code,302)
        cost=OperatingCost.objects.get()
        self.assertEqual(cost.month.day,1)
        self.assertEqual(cost.entered_by,self.admin)
        self.assertFalse(UsageEntry.objects.exists())
