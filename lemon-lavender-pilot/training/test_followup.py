from copy import deepcopy
from datetime import datetime, timedelta, timezone as dt_timezone
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from .followup import FOLLOWUP_POLICY, WorkflowError, advance_state, after_hours_window, business_day_labels, business_hours_context, initial_state, pending_actions, prepare_scenario, stage_heading, valid_email
from .models import Assignment, FollowupAttempt, Profile, UsageEntry
from .tests import PilotCase


def scenario(**changes):
    return {'source': 'google', 'arrival': 'new_lead', 'email_case': 'valid', 'preference': 'all', 'context': 'normal', 'day_one_weekday': 4, **changes}


class SequenceTests(SimpleTestCase):
    def apply(self, state, case, action, **data):
        return advance_state(state, case, FOLLOWUP_POLICY, action, data)[0]

    def run_to(self, target, **changes):
        case = scenario(**changes)
        state = initial_state(case)
        for stage in range(target):
            for action in list(pending_actions(state, case, FOLLOWUP_POLICY)):
                state = self.apply(state, case, action, elapsed_seconds=200)
            state = self.apply(state, case, 'advance')
        return state, case

    def test_exact_owner_sequence(self):
        self.assertEqual([s['actions'] for s in FOLLOWUP_POLICY['stages']], [
            ['call','voicemail','text','email'], ['call','text'], ['call','text','email'],
            ['call','text','email'], ['call','text','email'], ['final_message','archive']])

    def test_friday_monday_tuesday_business_day_rollover(self):
        self.assertEqual(business_day_labels(4, FOLLOWUP_POLICY), [
            {'day':1,'weekday':'Friday'}, {'day':2,'weekday':'Monday'}, {'day':3,'weekday':'Tuesday'}])
        for stage, weekday in [(0,'Friday'), (1,'Friday'), (2,'Monday'), (3,'Monday'), (4,'Tuesday')]:
            state, case = self.run_to(stage)
            self.assertIn(weekday, stage_heading(state, case, FOLLOWUP_POLICY))
        state, case = self.run_to(5)
        self.assertNotIn('Wednesday', stage_heading(state, case, FOLLOWUP_POLICY))

    def test_rollover_from_each_business_weekday(self):
        expected = [('Monday','Tuesday','Wednesday'), ('Tuesday','Wednesday','Thursday'),
                    ('Wednesday','Thursday','Friday'), ('Thursday','Friday','Monday'), ('Friday','Monday','Tuesday')]
        for start, names in enumerate(expected):
            self.assertEqual(tuple(d['weekday'] for d in business_day_labels(start,FOLLOWUP_POLICY)),names)

    def test_weekend_lead_first_day_is_not_inferred(self):
        for value in [5,6,-1,7,True,'Friday']:
            with self.assertRaises(WorkflowError):
                business_day_labels(value,FOLLOWUP_POLICY)

    def test_business_hours_convert_dst_with_pacific_timezone(self):
        winter = business_hours_context(datetime(2026,1,15,16,tzinfo=dt_timezone.utc),FOLLOWUP_POLICY)
        summer = business_hours_context(datetime(2026,7,15,15,tzinfo=dt_timezone.utc),FOLLOWUP_POLICY)
        self.assertEqual(winter['local'].hour,8)
        self.assertEqual(summer['local'].hour,8)
        self.assertEqual(winter['local'].tzname(),'PST')
        self.assertEqual(summer['local'].tzname(),'PDT')
        self.assertTrue(winter['within_regular_hours'])
        self.assertTrue(summer['within_regular_hours'])
        self.assertEqual(winter['holiday_policy'],'pending')

    def test_business_hours_open_close_weekend_boundaries(self):
        cases = [('2026-01-15T15:59:00+00:00',False), ('2026-01-15T16:00:00+00:00',True),
                 ('2026-01-16T00:59:00+00:00',True), ('2026-01-16T01:00:00+00:00',False),
                 ('2026-07-15T14:59:00+00:00',False), ('2026-07-16T00:00:00+00:00',False),
                 ('2026-11-07T00:30:00+00:00',True),  # UTC Saturday is still Friday afternoon in Portland.
                 ('2026-11-07T18:00:00+00:00',False)]
        for iso, expected in cases:
            with self.subTest(iso=iso):
                self.assertEqual(business_hours_context(datetime.fromisoformat(iso),FOLLOWUP_POLICY)['within_regular_hours'],expected)

    def test_no_naive_timezone_or_old_snapshot_hours_assumption(self):
        with self.assertRaises(WorkflowError):
            business_hours_context(datetime(2026,10,9,8),FOLLOWUP_POLICY)
        self.assertIsNone(business_hours_context(datetime(2026,10,9,8),{}))
        case=scenario(); del case['day_one_weekday']
        old=deepcopy(FOLLOWUP_POLICY); old.pop('business_weekdays'); old.pop('business_hours')
        self.assertEqual(stage_heading(initial_state(case),case,old),old['stages'][0]['name'])
        self.assertNotIn('next_response_at',FOLLOWUP_POLICY)
        self.assertNotIn('holiday_exclusions',FOLLOWUP_POLICY)

    def test_complete_sequence_archives_and_stops(self):
        for source in ['google','facebook']:
            for arrival in ['new_lead','missed_call']:
                state, case = self.run_to(5, source=source, arrival=arrival)
                state, event = advance_state(state, case, FOLLOWUP_POLICY, 'final_message')
                self.assertTrue(state['final_rehearsed'])
                self.assertIn('without selecting delivery channels', event['detail'])
                self.assertIn('please reach out', event['detail'])
                state = self.apply(state, case, 'archive')
                self.assertEqual(state['status'],'archived')
                self.assertEqual(pending_actions(state, case, FOLLOWUP_POLICY),[])
                for action in ['call','email','advance','final_message']:
                    with self.assertRaises(WorkflowError):
                        self.apply(state,case,action)

    def test_cannot_skip_call_or_voicemail_or_archive_early(self):
        case=scenario(); state=initial_state(case)
        for action in ['email','text','advance','archive','final_message']:
            with self.assertRaises(WorkflowError):
                self.apply(state,case,action)
        state=self.apply(state,case,'call')
        with self.assertRaises(WorkflowError):
            self.apply(state,case,'text')

    def test_five_minute_boundary_and_complete_first_outreach(self):
        case=scenario(); state=initial_state(case)
        for action in ['call','voicemail','text','email']:
            state=self.apply(state,case,action,elapsed_seconds=300)
        self.assertEqual(state['timing_flags'],[])
        state=initial_state(case)
        for action in ['call','voicemail','text']:
            state=self.apply(state,case,action,elapsed_seconds=240)
        state=self.apply(state,case,'email',elapsed_seconds=301)
        self.assertEqual(len(state['timing_flags']),1)
        self.assertIn('email',state['timing_flags'][0])

    def test_late_call_flag_and_nonmonotonic_clock_rejected(self):
        case=scenario(); state=self.apply(initial_state(case),case,'call',elapsed_seconds=400)
        self.assertEqual(len(state['timing_flags']),1)
        for seconds in [-1,0,399,3601,True]:
            with self.assertRaises(WorkflowError):
                self.apply(state,case,'voicemail',elapsed_seconds=seconds)

    def test_inbound_live_call_immediate_and_delayed(self):
        for context in ['normal','after_hours']:
            case=scenario(arrival='live_call',context=context); state=initial_state(case)
            self.assertEqual(pending_actions(state,case,FOLLOWUP_POLICY),['answer'])
            immediate=self.apply(state,case,'answer',answer_timing='immediate')
            self.assertEqual(immediate['status'],'responded')
            self.assertEqual(immediate['timing_flags'],[])
            delayed=self.apply(state,case,'answer',answer_timing='delayed')
            self.assertEqual(len(delayed['timing_flags']),1)
            with self.assertRaises(WorkflowError):
                self.apply(immediate,case,'call')

    def test_invalid_and_missing_email_skipped_in_every_window(self):
        for email_case in ['invalid','missing']:
            case=scenario(email_case=email_case); state=initial_state(case)
            self.assertFalse(state['email_valid'])
            for stage in range(5):
                pending=pending_actions(state,case,FOLLOWUP_POLICY)
                self.assertNotIn('email',pending)
                for action in pending:
                    state=self.apply(state,case,action)
                state=self.apply(state,case,'advance')
        self.assertTrue(valid_email('taylor@example.invalid'))
        self.assertFalse(valid_email('taylor@'))

    def test_channel_preferences_filter_the_sequence(self):
        expected={'call_only':['call','voicemail'], 'text_only':['text'], 'email_only':['email'], 'call_text':['call','voicemail','text']}
        for preference, actions in expected.items():
            case=scenario(preference=preference); state=initial_state(case)
            self.assertEqual(pending_actions(state,case,FOLLOWUP_POLICY),actions)
            for action in actions:
                state=self.apply(state,case,action)
            state=self.apply(state,case,'advance')
            self.assertNotIn('email',pending_actions(state,case,FOLLOWUP_POLICY))  # Day 1 EOD never adds email.

    def test_email_only_invalid_data_does_not_fall_back_to_phone(self):
        case=scenario(preference='email_only',email_case='invalid'); state=initial_state(case)
        self.assertEqual(state['status'],'no_channel')
        self.assertEqual(pending_actions(state,case,FOLLOWUP_POLICY),[])
        with self.assertRaises(WorkflowError):
            self.apply(state,case,'call')

    def test_response_at_every_window_stops_all_outreach(self):
        for stage in range(6):
            state,case=self.run_to(stage)
            state=self.apply(state,case,'response')
            self.assertEqual(state['status'],'responded')
            for action in ['call','text','email','voicemail','advance','final_message','archive']:
                with self.assertRaises(WorkflowError):
                    self.apply(state,case,action)

    def test_optout_at_every_window_stops_all_outreach(self):
        for stage in range(6):
            state,case=self.run_to(stage)
            state=self.apply(state,case,'opt_out')
            self.assertEqual(state['status'],'opted_out')
            for action in ['call','text','email','voicemail','advance','final_message','callback','response','preference']:
                with self.assertRaises(WorkflowError):
                    self.apply(state,case,action)

    def test_preference_response_exits_sequence(self):
        case=scenario(); state=self.apply(initial_state(case),case,'preference',preference='email_only')
        self.assertEqual(state['status'],'responded')
        self.assertEqual(state['allowed_channels'],['email'])
        with self.assertRaises(WorkflowError):
            self.apply(state,case,'call')

    def test_callback_requires_response_and_honors_preferences(self):
        case=scenario(preference='text_only'); state=initial_state(case)
        data={'channel':'text','promised_when':'Tuesday, date and time zone need clarification', 'note':'Customer requested a follow-up text; clarify details before promising a time.'}
        with self.assertRaises(WorkflowError):
            self.apply(state,case,'callback',**data)
        state=self.apply(state,case,'response')
        with self.assertRaises(WorkflowError):
            self.apply(state,case,'callback',**(data|{'channel':'call'}))
        state=self.apply(state,case,'callback',**data)
        self.assertEqual(state['status'],'responded')
        self.assertFalse(state['callback']['scheduled'])
        self.assertEqual(state['callback']['channel'],'text')
        state=self.apply(state,case,'opt_out')
        self.assertIsNone(state['callback'])

    def test_earlier_after_hours_policy_remains_on_hold(self):
        old=deepcopy(FOLLOWUP_POLICY); old.pop('after_hours_first_outreach')
        case=scenario(context='after_hours'); state=initial_state(case,old)
        self.assertEqual(state['status'],'policy_hold')
        with self.assertRaises(WorkflowError):
            advance_state(state,case,old,'call')
        self.assertEqual(FOLLOWUP_POLICY['unresolved'],['Holiday exclusions','Final message delivery channel(s)'])
        self.assertNotIn('schedule',FOLLOWUP_POLICY)
        self.assertNotIn('final_channels',FOLLOWUP_POLICY)

    def test_after_hours_weekend_and_closing_boundary(self):
        for arrived, expected in [
            ('2026-10-09T17:00:00-07:00','2026-10-12T08:05:00-07:00'),
            ('2026-10-09T23:59:59-07:00','2026-10-12T08:05:00-07:00'),
            ('2026-10-10T12:00:00-07:00','2026-10-12T08:05:00-07:00'),
            ('2026-10-11T12:00:00-07:00','2026-10-12T08:05:00-07:00'),
            ('2026-10-08T17:00:00-07:00','2026-10-09T08:05:00-07:00'),
            ('2026-10-12T07:59:59-07:00','2026-10-12T08:05:00-07:00'),
            ('2026-10-10T00:00:00+00:00','2026-10-12T08:05:00-07:00')]:
            with self.subTest(arrived=arrived):
                window=after_hours_window(datetime.fromisoformat(arrived),FOLLOWUP_POLICY)
                self.assertEqual(window['deadline_at'],expected)
                self.assertEqual(datetime.fromisoformat(window['opens_at']).hour,8)

    def test_after_hours_dst_uses_deadline_date_offset(self):
        for arrived, expected, utc_hour in [
            ('2026-03-06T17:30:00-08:00','2026-03-09T08:05:00-07:00',15),
            ('2026-11-01T01:30:00-07:00','2026-11-02T08:05:00-08:00',16),
            ('2026-11-01T01:30:00-08:00','2026-11-02T08:05:00-08:00',16),
            ('2026-10-30T17:30:00-07:00','2026-11-02T08:05:00-08:00',16)]:
            window=after_hours_window(datetime.fromisoformat(arrived),FOLLOWUP_POLICY)
            self.assertEqual(window['deadline_at'],expected)
            self.assertEqual(datetime.fromisoformat(window['deadline_at']).astimezone(dt_timezone.utc).hour,utc_hour)

    def test_after_hours_rejects_naive_and_business_hours_input(self):
        for arrived in [datetime(2026,10,9,17,30),datetime.fromisoformat('2026-10-09T08:00:00-07:00'),datetime.fromisoformat('2026-10-09T16:59:59-07:00')]:
            with self.assertRaises(WorkflowError):
                after_hours_window(arrived,FOLLOWUP_POLICY)

    def test_after_hours_timing_boundary_and_evidence(self):
        case=prepare_scenario(scenario(context='after_hours',after_hours_fixture='spring_dst'),FOLLOWUP_POLICY)
        self.assertEqual(case['day_one_weekday'],0)
        state=initial_state(case)
        self.assertEqual(state['status'],'active')
        self.assertIn('Monday, Mar 09, 2026 · 08:05 AM PDT',stage_heading(state,case,FOLLOWUP_POLICY))
        for action in ['call','voicemail','text']:
            state,event=advance_state(state,case,FOLLOWUP_POLICY,action,{'elapsed_seconds':300})
        self.assertEqual(state['timing_flags'],[])
        self.assertIn('2026-03-09T08:05:00-07:00',event['detail'])
        state,event=advance_state(state,case,FOLLOWUP_POLICY,'email',{'elapsed_seconds':301})
        self.assertEqual(len(state['timing_flags']),1)
        self.assertIn('08:05 AM Pacific deadline',state['timing_flags'][0])
        self.assertIn('2026-03-09T08:05:01-07:00',event['detail'])
        state=self.apply(state,case,'advance')
        self.assertIn('Monday',stage_heading(state,case,FOLLOWUP_POLICY))

    def test_after_hours_still_honors_preferences_validity_and_live_calls(self):
        for changes, expected in [({'preference':'text_only'},['text']),({'email_case':'invalid'},['call','voicemail','text']),({'arrival':'live_call'},['answer']),({'preference':'email_only','email_case':'missing'},[])]:
            case=prepare_scenario(scenario(context='after_hours',**changes),FOLLOWUP_POLICY)
            self.assertEqual(pending_actions(initial_state(case),case,FOLLOWUP_POLICY),expected)

    def test_final_message_must_precede_archive(self):
        state,case=self.run_to(5)
        with self.assertRaises(WorkflowError):
            self.apply(state,case,'archive')

    def test_input_state_is_immutable(self):
        case=scenario(); state=initial_state(case); before=deepcopy(state)
        self.apply(state,case,'call')
        self.assertEqual(state,before)


class FollowupWebTests(PilotCase):
    def begin(self, **changes):
        self.sign_as()
        Assignment.objects.filter(pk=self.assignment.pk).update(welcome_completed_at=timezone.now(),followup_lesson_completed_at=timezone.now())
        response=self.client.post(reverse('followup_setup',args=[self.assignment.pk]),scenario(**changes))
        self.assertEqual(response.status_code,302)
        return FollowupAttempt.objects.order_by('-started_at').first()

    def act(self, attempt, action, **data):
        attempt.refresh_from_db()
        return self.client.post(reverse('followup_act',args=[attempt.pk]), {'revision':attempt.revision,'action':action,**data})

    def test_lesson_checks_and_prerequisites(self):
        self.sign_as()
        url=reverse('followup_lesson',args=[self.assignment.pk])
        self.assertRedirects(self.client.get(url),reverse('welcome',args=[self.assignment.pk]))
        self.assertEqual(self.client.post(reverse('followup_setup',args=[self.assignment.pk]),scenario()).status_code,409)
        Assignment.objects.filter(pk=self.assignment.pk).update(welcome_completed_at=timezone.now())
        response=self.client.get(url)
        self.assertContains(response,'Monday through Friday')
        self.assertContains(response,'8 AM–5 PM Pacific')
        self.assertContains(response,'by 8:05 AM Pacific on the next business day')
        self.assertContains(response,'Holiday exclusions')
        self.assertContains(response,'Final message delivery channel(s)')
        self.assertEqual(self.client.post(url,{'first':'five','response':'continue','final':'pending'}).status_code,200)
        self.assignment.refresh_from_db()
        self.assertIsNone(self.assignment.followup_lesson_completed_at)
        self.assertEqual(self.client.post(url,{'first':'five','response':'stop','final':'pending'}).status_code,302)
        self.assignment.refresh_from_db()
        self.assertIsNotNone(self.assignment.followup_lesson_completed_at)

    def test_repeated_start_and_post_are_idempotent(self):
        attempt=self.begin()
        self.client.post(reverse('followup_setup',args=[self.assignment.pk]),scenario())
        self.assertEqual(FollowupAttempt.objects.count(),1)
        data={'revision':0,'action':'call','elapsed_seconds':120}
        self.client.post(reverse('followup_act',args=[attempt.pk]),data)
        self.client.post(reverse('followup_act',args=[attempt.pk]),data)
        attempt.refresh_from_db()
        self.assertEqual(len(attempt.events),1)
        self.assertEqual(attempt.state['completed'],['call'])

    def test_interrupted_exercise_resumes_with_evidence(self):
        attempt=self.begin()
        self.act(attempt,'call',elapsed_seconds=60)
        response=self.client.post(reverse('followup_setup',args=[self.assignment.pk]),scenario())
        self.assertEqual(response.url,reverse('followup_attempt',args=[attempt.pk]))
        self.assertContains(self.client.get(response.url),'Simulated elapsed time: 60 seconds')

    def test_full_workflow_has_no_external_sends_or_scheduling(self):
        attempt=self.begin(source='facebook')
        with patch('socket.create_connection',side_effect=AssertionError('Network forbidden')), \
             patch('django.core.mail.send_mail',side_effect=AssertionError('Mail forbidden')), \
             patch('training.providers.PreviewEmail.deliver_link',side_effect=AssertionError('Email adapter forbidden')):
            for stage in range(6):
                attempt.refresh_from_db()
                for action in list(pending_actions(attempt.state,attempt.scenario,attempt.policy)):
                    self.assertEqual(self.act(attempt,action,elapsed_seconds=180).status_code,302)
                if stage<5:
                    self.assertEqual(self.act(attempt,'advance').status_code,302)
        attempt.refresh_from_db()
        self.assertEqual(attempt.status,'archived')
        self.assertEqual(len(attempt.events),22)
        self.assertEqual(UsageEntry.objects.count(),0)
        response=self.client.get(reverse('followup_attempt',args=[attempt.pk]))
        self.assertContains(response,'no delivery occurred')
        self.assertContains(response,'No call, voicemail, text, email, schedule, or real lead update is created')

    def test_response_stops_sequence_and_callback_is_only_a_note(self):
        attempt=self.begin()
        self.act(attempt,'response')
        self.act(attempt,'callback',channel='call',promised_when='October 13, 2026, 10 am America/Los_Angeles', note='Customer requested this callback; confirm any ambiguity before taking action.')
        attempt.refresh_from_db()
        self.assertEqual(attempt.status,'responded')
        self.assertFalse(attempt.state['callback']['scheduled'])
        before=len(attempt.events)
        self.act(attempt,'email')
        attempt.refresh_from_db()
        self.assertEqual(len(attempt.events),before)
        self.act(attempt,'opt_out')
        attempt.refresh_from_db()
        self.assertIsNone(attempt.state['callback'])
        self.assertEqual(attempt.status,'opted_out')

    def test_invalid_email_cannot_be_forced(self):
        attempt=self.begin(email_case='invalid')
        for action in ['call','voicemail','text']:
            self.act(attempt,action)
        self.act(attempt,'email')
        attempt.refresh_from_db()
        self.assertNotIn('email',[e['action'] for e in attempt.events])
        self.assertContains(self.client.get(reverse('followup_attempt',args=[attempt.pk])),'Email is invalid or missing')

    def test_different_learner_cannot_read_or_write(self):
        attempt=self.begin()
        other=get_user_model().objects.create_user(username='followup-other@example.invalid')
        Profile.objects.create(user=other,role='learner')
        self.sign_as(other)
        self.assertEqual(self.client.get(reverse('followup_attempt',args=[attempt.pk])).status_code,403)
        self.assertEqual(self.act(attempt,'response').status_code,403)

    def test_trainers_read_but_cannot_take_learner_actions(self):
        attempt=self.begin()
        self.sign_as(self.trainer)
        self.assertEqual(self.client.get(reverse('followup_attempt',args=[attempt.pk])).status_code,200)
        self.assertEqual(self.act(attempt,'call').status_code,403)

    def test_expiry_preserves_evidence_and_allows_new_attempt(self):
        attempt=self.begin()
        self.act(attempt,'call')
        FollowupAttempt.objects.filter(pk=attempt.pk).update(started_at=timezone.now()-timedelta(minutes=21))
        self.act(attempt,'voicemail')
        attempt.refresh_from_db()
        self.assertEqual(attempt.status,'expired')
        self.assertEqual(len(attempt.events),1)
        self.client.post(reverse('followup_setup',args=[self.assignment.pk]),scenario())
        self.assertEqual(FollowupAttempt.objects.count(),2)

    @override_settings(MAX_ATTEMPTS_PER_DAY=1)
    def test_daily_limit_counts_both_exercise_types(self):
        attempt=self.prepare()
        self.mutate(attempt,op='abandon')
        Assignment.objects.filter(pk=self.assignment.pk).update(followup_lesson_completed_at=timezone.now())
        self.assertEqual(self.client.post(reverse('followup_setup',args=[self.assignment.pk]),scenario()).status_code,429)

    @override_settings(MAX_ATTEMPTS_PER_DAY=1)
    def test_inbound_call_limit_counts_followup_exercises(self):
        attempt=self.begin()
        self.act(attempt,'opt_out')
        Assignment.objects.filter(pk=self.assignment.pk).update(lesson_completed_at=timezone.now())
        self.assertEqual(self.client.post(reverse('start',args=[self.assignment.pk])).status_code,429)

    def test_policy_snapshot_does_not_change_with_future_edits(self):
        attempt=self.begin()
        saved=deepcopy(attempt.policy)
        with patch.dict(FOLLOWUP_POLICY,{'first_outreach_seconds':10,'version':'future-version'}):
            self.act(attempt,'call',elapsed_seconds=100)
        attempt.refresh_from_db()
        self.assertEqual(attempt.policy,saved)
        self.assertEqual(attempt.state['timing_flags'],[])

    def test_new_attempt_saves_business_day_anchor_and_shows_rollover(self):
        attempt=self.begin(day_one_weekday=4)
        self.assertEqual(attempt.scenario['day_one_weekday'],4)
        self.assertEqual(attempt.policy['business_hours']['timezone'],'America/Los_Angeles')
        response=self.client.get(reverse('followup_attempt',args=[attempt.pk]))
        for expected in ['Day 1: Friday','Day 2: Monday','Day 3: Tuesday','8 AM–5 PM Pacific']:
            self.assertContains(response,expected)

    def test_after_hours_saves_fictional_deadline_and_resumes_without_rebasing(self):
        attempt=self.begin(context='after_hours',after_hours_fixture='fall_dst',day_one_weekday=4,
            first_outreach_window={'deadline_at':'2099-01-01T08:05:00+00:00'})
        saved=deepcopy(attempt.scenario)
        self.assertEqual(attempt.status,'active')
        self.assertEqual(saved['day_one_weekday'],0)
        self.assertEqual(saved['first_outreach_window']['deadline_at'],'2026-11-02T08:05:00-08:00')
        response=self.client.get(reverse('followup_attempt',args=[attempt.pk]))
        for text in ['Day 1: Monday','Day 2: Tuesday','Day 3: Wednesday','08:05 AM PST','05:30 PM PDT',
                     'Simulated seconds since the 8:00 AM business opening','Holiday exclusions']:
            self.assertContains(response,text)
        with patch.dict(FOLLOWUP_POLICY,{'after_hours_first_outreach':{'deadline':'08:01'},'version':'future'}):
            self.act(attempt,'call',elapsed_seconds=300)
        resumed=self.client.post(reverse('followup_setup',args=[self.assignment.pk]),scenario(context='after_hours',after_hours_fixture='spring_dst'))
        self.assertEqual(resumed.url,reverse('followup_attempt',args=[attempt.pk]))
        attempt.refresh_from_db()
        self.assertEqual(attempt.scenario,saved)
        self.assertEqual(attempt.state['timing_flags'],[])
        self.assertIn('2026-11-02T08:05:00-08:00',attempt.events[0]['detail'])

    def test_after_hours_complete_sequence_has_no_external_side_effects(self):
        with patch('socket.create_connection',side_effect=AssertionError('Network forbidden')), \
             patch('django.core.mail.send_mail',side_effect=AssertionError('Mail forbidden')), \
             patch('training.providers.PreviewEmail.deliver_link',side_effect=AssertionError('Email adapter forbidden')):
            attempt=self.begin(context='after_hours',after_hours_fixture='saturday',arrival='missed_call')
            for stage in range(6):
                attempt.refresh_from_db()
                for action in list(pending_actions(attempt.state,attempt.scenario,attempt.policy)):
                    self.assertEqual(self.act(attempt,action,elapsed_seconds=300).status_code,302)
                if stage<5:
                    self.act(attempt,'advance')
        attempt.refresh_from_db()
        self.assertEqual(attempt.status,'archived')
        self.assertEqual(len(attempt.events),22)
        self.assertEqual(attempt.state['timing_flags'],[])
        self.assertEqual(UsageEntry.objects.count(),0)

    def test_existing_v2_after_hours_hold_and_evidence_are_not_upgraded(self):
        attempt=self.begin()
        old=deepcopy(attempt.policy); old.pop('after_hours_first_outreach')
        old['version']='owner-lead-followup-2026-10-06-v2'
        old['unresolved'].append('After-hours first-response timing')
        case=scenario(context='after_hours',version='synthetic-lead-workflow-v2')
        state=initial_state(case,old)
        evidence=[{'id':'event-1','label':'Earlier review','detail':'After-hours policy pending at the time.'}]
        FollowupAttempt.objects.filter(pk=attempt.pk).update(policy=old,scenario=case,state=state,status='policy_hold',events=evidence)
        response=self.client.get(reverse('followup_attempt',args=[attempt.pk]))
        self.assertContains(response,'earlier policy snapshot with unapproved after-hours timing')
        self.assertNotContains(response,'Fictional after-hours deadline')
        self.act(attempt,'call',elapsed_seconds=100)
        attempt.refresh_from_db()
        self.assertEqual((attempt.policy,attempt.scenario,attempt.state,attempt.events),(old,case,state,evidence))

    def test_unknown_after_hours_fixture_rejected(self):
        self.sign_as()
        Assignment.objects.filter(pk=self.assignment.pk).update(welcome_completed_at=timezone.now(),followup_lesson_completed_at=timezone.now())
        response=self.client.post(reverse('followup_setup',args=[self.assignment.pk]),scenario(context='after_hours',after_hours_fixture='real-arrival'))
        self.assertEqual(response.status_code,200)
        self.assertFalse(FollowupAttempt.objects.exists())

    def test_existing_history_keeps_earlier_policy_and_evidence(self):
        attempt=self.begin()
        old_policy=deepcopy(attempt.policy)
        old_policy['version']='owner-lead-followup-2026-10-06-v1'
        old_policy.pop('business_weekdays'); old_policy.pop('business_hours')
        old_policy.pop('after_hours_first_outreach')
        old_policy['unresolved']=['Whether days mean business days','After-hours lead handling','Final message delivery channel(s)']
        old_scenario=deepcopy(attempt.scenario); old_scenario.pop('day_one_weekday')
        old_events=[{'id':'event-1','label':'Saved earlier event','detail':'Preserve original evidence.'}]
        FollowupAttempt.objects.filter(pk=attempt.pk).update(policy=old_policy,scenario=old_scenario,events=old_events)
        response=self.client.get(reverse('followup_attempt',args=[attempt.pk]))
        self.assertContains(response,'earlier policy snapshot')
        attempt.refresh_from_db()
        self.assertEqual(attempt.policy,old_policy)
        self.assertEqual(attempt.scenario,old_scenario)
        self.assertEqual(attempt.events,old_events)

    def test_weekend_setup_not_silently_moved_to_monday(self):
        self.sign_as()
        Assignment.objects.filter(pk=self.assignment.pk).update(welcome_completed_at=timezone.now(),followup_lesson_completed_at=timezone.now())
        response=self.client.post(reverse('followup_setup',args=[self.assignment.pk]),scenario(day_one_weekday=5))
        self.assertEqual(response.status_code,200)
        self.assertFalse(FollowupAttempt.objects.exists())

    def test_callback_notes_are_escaped(self):
        attempt=self.begin()
        self.act(attempt,'response')
        self.act(attempt,'callback',channel='call',promised_when='Tuesday, details pending',note='<script>alert("fictional")</script>')
        response=self.client.get(reverse('followup_attempt',args=[attempt.pk]))
        self.assertNotContains(response,'<script>alert(')
        self.assertContains(response,'&lt;script&gt;')

    def test_action_get_and_bad_setup_rejected(self):
        attempt=self.begin()
        self.assertEqual(self.client.get(reverse('followup_act',args=[attempt.pk])).status_code,405)
        self.assertEqual(self.client.post(reverse('followup_setup',args=[self.assignment.pk]),scenario(source='real-integration')).status_code,200)
        self.assertEqual(FollowupAttempt.objects.count(),1)
    def test_invalid_callback_preserves_written_note(self):
        attempt=self.begin();self.act(attempt,'response')
        response=self.act(attempt,'callback',channel='call',promised_when='',note='Please confirm the Pacific date and time before calling Taylor.')
        self.assertContains(response,'Please confirm the Pacific date and time before calling Taylor.')
        self.assertContains(response,'This field is required.')
        attempt.refresh_from_db();self.assertFalse(attempt.state.get('callback'))
    def test_stale_callback_after_optout_retains_draft_without_authorizing_outreach(self):
        attempt=self.begin();self.act(attempt,'response');attempt.refresh_from_db();old_revision=attempt.revision
        self.act(attempt,'opt_out')
        response=self.client.post(reverse('followup_act',args=[attempt.pk]),{'revision':old_revision,'action':'callback','channel':'call',
            'promised_when':'Tuesday October 13 at 10 AM Pacific','note':'This stale callback note must not restart the stopped outreach.'})
        self.assertContains(response,'This stale callback note',status_code=409)
        self.assertContains(response,'does not authorize outreach',status_code=409)
        attempt.refresh_from_db();self.assertEqual(attempt.status,'opted_out');self.assertFalse(attempt.state.get('callback'))
