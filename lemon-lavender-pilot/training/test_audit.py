"""Adversarial audit cases. All files, identities and provider reports are fictional."""
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from unittest.mock import patch
import tempfile
from django.test import SimpleTestCase
from django.urls import reverse
from . import test_recordings
from .test_recordings import wav
from .tests import PilotCase
from .models import PracticeRecording
from .live_runtime import CallSession
from .live_provider import conversation_config
from .live_coaching import build_feedback
from .live_coaching import local_policy_flags
from .test_sales_scenarios import local_attempt, discovery, concerns, turn, notes
from .sales_feedback import validate_sales_outcome
from .written_checks import policy_issues
from copy import deepcopy
from datetime import date
from django.contrib.auth import get_user_model
from django.test import override_settings, Client
from . import test_sales_scenarios
from .models import Attempt, LiveCall, Profile, Review
from .policies import POLICY
from .promotions import promotion_status
from .sales_reports import summary
from .live_runtime import LiveController
from .live_budget import TestBudget, BudgetDenied
from .live_credentials import ServerSecret


class AuditEvidenceTests(SimpleTestCase):
    def test_first_missing_capture_chunk_is_incomplete(self):
        with tempfile.TemporaryDirectory() as folder:
            s=CallSession('audit',Mock(),conversation_config({},{}),Path(folder),Mock(),clock=lambda:1)
            s.handle({'type':'session.started','session':s.config},Mock())
            s.accept_audio(b'\0\0'*100,0,24000,b'\0\0'*100)
            self.assertTrue(s.capture_missing)

    def test_customer_or_crm_citation_cannot_credit_learner_behavior(self):
        for speaker in ['Customer','Practice CRM']:
            a=local_attempt();a.transcript=[{'id':'other','speaker':speaker,'text':'Ask about the home.'}]
            feedback=build_feedback(a,{'observations':[{'title':'Discovery','status':'observed','evidence_ids':['other']}]})
            self.assertEqual(feedback['observations'][0]['status'],'Needs manager review')

    def test_verbal_agreement_and_proposal_never_mean_won(self):
        a=local_attempt();discovery(a);concerns(a);turn(a,'close');notes(a)
        a.crm['follow_up']='Proposal sent; Taylor said yes. Deposit paid is only a learner claim.'
        outcome=validate_sales_outcome(a)
        self.assertEqual(outcome['code'],'qualified_request')
        self.assertFalse(outcome['simulated_sale'])

    def test_reported_question_cannot_hide_trainee_waiver_same_sentence(self):
        self.assertTrue(policy_issues('taylor asked for a discount, and i can waive the initial deep.'))

    def test_quoted_policy_phrase_is_flag_for_review_not_confirmed_violation(self):
        a=local_attempt();a.transcript=[{'id':'live-1','speaker':'Learner','text':'I must never say we can waive the initial deep.'}]
        a.actions=local_policy_flags(a)
        feedback=build_feedback(a)
        self.assertTrue(feedback['policy_flags']);self.assertEqual(feedback['outcome']['violations'],[])
        self.assertEqual(feedback['outcome']['code'],'manager_policy_review_required')


class AuditRecordingTests(PilotCase):
    setUp = test_recordings.RecordingTests.setUp
    upload = test_recordings.RecordingTests.upload
    def test_corrupt_duplicate_is_not_acknowledged_as_saved(self):
        a=self.prepare();self.upload(a);record=PracticeRecording.objects.get()
        path=Path(self.folder.name)/(str(record.pk)+'.wav')
        path.write_bytes(wav()[:-2]+b'\0\0')
        self.assertEqual(self.upload(a).status_code,503)

        self.assertEqual(self.client.get(reverse('recording_play',args=[record.pk])).status_code,404)

    def test_symlink_cannot_be_played_or_acknowledged(self):
        a=self.prepare();self.upload(a);record=PracticeRecording.objects.get()
        path=Path(self.folder.name)/(str(record.pk)+'.wav');path.unlink()
        fake=Path(self.folder.name)/'fictional-private-canary.txt';fake.write_text('fictional audit canary')
        path.symlink_to(fake)
        self.assertEqual(self.client.get(reverse('recording_play',args=[record.pk])).status_code,404)
        self.assertEqual(self.upload(a).status_code,503)

    def test_recording_seek_head_and_end_range(self):
        a=self.prepare();self.upload(a);r=PracticeRecording.objects.get();url=reverse('recording_play',args=[r.pk])
        response=self.client.get(url,HTTP_RANGE='bytes=44-49')
        self.assertEqual(response.status_code,206);self.assertEqual(b''.join(response.streaming_content),wav()[44:50])
        response=self.client.head(url);self.assertEqual(response.status_code,200);self.assertEqual(int(response['Content-Length']),len(wav()))
        self.assertEqual(self.client.get(url,HTTP_RANGE='bytes=999999-').status_code,416)

    def test_all_evidence_surfaces_enforce_object_and_revoked_access(self):
        a=self.prepare();self.upload(a);r=PracticeRecording.objects.get()
        a.status='submitted';a.save(update_fields=['status'])
        LiveCall.objects.create(attempt=a,approval='fictional-audit',state='closed')
        with tempfile.TemporaryDirectory() as root,override_settings(LIVE_RECORDING_DIR=root):
            directory=Path(root)/str(a.pk);directory.mkdir();(directory/'learner.wav').write_bytes(wav())
            surfaces=[('attempt',[a.pk]),('attempt_export',[a.pk]),('recording_play',[r.pk]),
                      ('recording_download',[r.pk]),('live_detail',[a.pk]),('live_audio',[a.pk,'learner']),
                      ('live_audio_download',[a.pk,'learner']),('coaching',[a.assignment_id]),('sales_report',[a.assignment_id])]
            other=get_user_model().objects.create_user(username='audit-foreign');Profile.objects.create(user=other,role='learner')
            for actor,expected in [(other,403),(self.learner,200),(self.trainer,200),(self.admin,200)]:
                self.sign_as(actor)
                for name,args in surfaces:
                    response=self.client.get(reverse(name,args=args),HTTP_RANGE='bytes=0-10')
                    self.assertIn(response.status_code,{expected,206} if expected==200 else {expected},(actor.username,name))
                    response.close()
            self.sign_as(self.learner);Profile.objects.filter(user=self.learner).update(invited=False)
            for name,args in surfaces:
                self.assertEqual(self.client.get(reverse(name,args=args)).status_code,403,name)
            self.learner.is_active=False;self.learner.save(update_fields=['is_active'])
            self.assertEqual(self.client.get(reverse('attempt_export',args=[a.pk])).status_code,302)

    def test_manager_can_reference_audio_but_not_an_invented_or_out_of_range_time(self):
        from .review_evidence import learner_reference
        a=self.prepare();self.upload(a);r=PracticeRecording.objects.get()
        self.assertTrue(learner_reference(a,str(r.pk)+' at 00:00.020 clarifies the concern.'))
        self.assertFalse(learner_reference(a,str(r.pk)+' at 00:01 clarifies the concern.'))
        self.assertFalse(learner_reference(a,'invented-recording at 00:00.020 clarifies the concern.'))


class AuditOwnerFlowTests(PilotCase):
    start_scenario=test_sales_scenarios.ScenarioFlowTests.start_scenario
    finish_scenario=test_sales_scenarios.ScenarioFlowTests.finish_scenario

    def test_request_stays_nonwin_until_explicit_manager_simulated_deposit(self):
        a=self.finish_scenario(self.start_scenario());before=deepcopy(a.feedback)
        self.assertEqual(summary(self.assignment)['periods'][0]['wins'],0)
        self.sign_as(self.trainer)
        response=self.client.post(reverse('review',args=[a.pk]),{'decision':'retry','coaching':'Practice a calm and clear acknowledgment.', 'simulated_deposit':'on'})
        self.assertEqual(response.status_code,302)
        r=Review.objects.get(attempt=a);self.assertTrue(r.simulated_deposit_reference.startswith('SIMULATED-DEPOSIT-'))
        self.assertEqual(summary(self.assignment)['periods'][0]['wins'],1)
        a.refresh_from_db();self.assertEqual(a.feedback,before);self.assertFalse(a.feedback['outcome']['deposit_paid'])
        exported=self.client.get(reverse('attempt_export',args=[a.pk])).json()
        self.assertEqual(exported['review']['simulated_deposit_reference'],r.simulated_deposit_reference)
        self.assertEqual(self.client.post(reverse('review',args=[a.pk]),{'decision':'retry','coaching':'Repeated review cannot duplicate the deposit.', 'simulated_deposit':'on'}).status_code,409)
        self.assertEqual(Review.objects.count(),1)

    def test_proposal_followup_and_forged_learner_deposit_cannot_win(self):
        a=self.start_scenario('think_about_it');self.mutate(a,op='turn',action='discover')
        self.mutate(a,op='submit');self.sign_as(self.trainer)
        response=self.client.post(reverse('review',args=[a.pk]),{'decision':'retry','coaching':'Confirm the specific agreed next step.', 'simulated_deposit':'on'})
        self.assertContains(response,'An explicit simulated deposit',status_code=400)
        self.assertFalse(Review.objects.exists());self.assertEqual(summary(self.assignment)['periods'][0]['wins'],0)
        self.sign_as();self.assertEqual(self.client.post(reverse('review',args=[a.pk]),{'simulated_deposit':'on'}).status_code,403)

    def test_manager_readiness_requires_specific_learner_objection_evidence(self):
        a=self.finish_scenario(self.start_scenario());self.sign_as(self.trainer)
        data={'decision':'ready','coaching':'Keep listening before explaining the relevant scope.', 'override_reason':'Reviewed this practice call with the trainee.'}
        for evidence in ['', 'invented-id addressed the concern', a.transcript[0]['id']+' customer question alone']:
            response=self.client.post(reverse('review',args=[a.pk]),{**data,'objection_evidence':evidence})
            self.assertEqual(response.status_code,400);self.assertFalse(Review.objects.exists())
        ident=next(e['evidence'] for e in a.actions if e['code']=='respond')
        self.assertEqual(self.client.post(reverse('review',args=[a.pk]),{**data,'objection_evidence':ident+' connects required initial deep to buildup and checks understanding.'}).status_code,302)
        self.assertTrue(Review.objects.get().criteria_version)

    def test_historical_request_remains_visible_but_not_reclassified_as_deposit_win(self):
        a=self.finish_scenario(self.start_scenario())
        a.policy.pop('owner_decisions');a.policy['version']='historical-v5';a.feedback['outcome']['simulated_sale']=True;a.save()
        original=deepcopy(a.feedback)
        report=summary(self.assignment);self.assertEqual(report['legacy_full_calls'],1);self.assertEqual(report['full_calls'],0)
        a.refresh_from_db();self.assertEqual(a.feedback,original)

    def test_finalizing_call_keeps_notes_saved_while_coaching_is_in_flight(self):
        a=self.start_scenario();a.scenario['mode']='live';a.save(update_fields=['scenario'])
        LiveCall.objects.create(attempt=a,approval='fictional-audit',state='finalizing')
        with tempfile.TemporaryDirectory() as root,override_settings(LIVE_RECORDING_DIR=root):
            engine=LiveController();engine.arm(ServerSecret('sk-fictional-audit-only'),TestBudget(root));engine.budget.reserve(str(a.pk))
            crm={'initial_quote':570,'recurring_quote':220,'needs':'Saved during coaching'}
            event={'code':'saved_quote','evidence':'crm-last','order':0}
            def coaching_finishes(*args):
                Attempt.objects.filter(pk=a.pk).update(crm=crm,transcript=[{'id':'crm-last','speaker':'Practice CRM','text':'Latest fictional handoff'}],actions=[event],revision=1)
                return {'observations':[]}, {'model':'gpt-4.1-mini','input_tokens':10,'output_tokens':10,'estimated_cents':'0.002','price_version':'fictional-audit'}
            result={'confirmed':True,'usage_seconds':1,'error_code':'','local_elapsed_seconds':1,
                'fragments':[{'speaker':'learner','text':'Tell me about the home.','start_ms':0,'end_ms':500}]}
            with patch('training.live_runtime.request_coaching',side_effect=coaching_finishes):engine.finalize(str(a.pk),result)
            a.refresh_from_db();self.assertEqual(a.crm,crm);self.assertIn(event,a.actions)
            self.assertEqual(a.transcript[-1]['id'],'crm-last');self.assertEqual(a.revision,2)
            self.assertTrue(a.feedback['outcome']['quote_correct'])

    def test_changed_configuration_cannot_rearm_prepared_allowance(self):
        # Only a new temporary ledger. Never touch the actual unused grant.
        from .voice_quality_acceptance import VoiceQualityBudget
        with tempfile.TemporaryDirectory() as root:
            budget=VoiceQualityBudget(root);budget.prepare(self.assignment.pk)
            path=Path(root)/(budget.storage_name+'.json');before=path.read_bytes()
            with patch('training.voice_quality_acceptance.fingerprint',return_value='changed-after-owner-decisions'):
                with self.assertRaises(BudgetDenied):budget.arm()
            self.assertEqual(path.read_bytes(),before)

    def test_manager_must_resolve_provisional_flag_before_readiness(self):
        a=self.finish_scenario(self.start_scenario())
        ident=next(e['evidence'] for e in a.actions if e['code']=='respond')
        a.feedback['policy_flags']=[{'issue':'Possible quoted policy phrase','evidence_id':ident,'exact_quote':'initial deep'}]
        a.save(update_fields=['feedback']);self.sign_as(self.trainer)
        data={'decision':'ready','coaching':'Continue explaining the initial work clearly.',
              'objection_evidence':ident+' addresses the concern about the first clean.',
              'override_reason':'Listened to the evidence: this quotes an example of what never to promise.'}
        for assessment in ['', 'confirmed']:
            self.assertEqual(self.client.post(reverse('review',args=[a.pk]),{**data,'policy_flag_assessment':assessment}).status_code,400)
        self.assertEqual(self.client.post(reverse('review',args=[a.pk]),{**data,'policy_flag_assessment':'context_or_transcription'}).status_code,302)
        self.assertEqual(Review.objects.get().policy_flag_assessment,'context_or_transcription')

    def test_manager_can_verify_live_escalation_with_saved_reason_and_evidence(self):
        a=self.start_scenario('promotion_question');a.scenario['mode']='live';a.status='submitted'
        a.transcript=[{'id':'live-1','speaker':'Learner','text':'May I record your promotion question for manager verification?'}]
        a.crm={'disposition':'escalation','reason':'Promotion terms need verification.'}
        a.feedback=build_feedback(a);a.save();LiveCall.objects.create(attempt=a,approval='fake-audit',state='closed')
        self.sign_as(self.trainer)
        data={'decision':'escalation','coaching':'Keep the unresolved offer distinct from a promise.',
            'override_reason':'Listened and verified the appropriate escalation in the fictional call.',
            'evidence':'live-1 asks for manager verification of the promotion.'}
        self.assertEqual(self.client.post(reverse('review',args=[a.pk]),data).status_code,302)
        self.assertFalse(Review.objects.get().simulated_deposit_reference)


class PromotionAuditTests(SimpleTestCase):
    def setUp(self):
        self.policy=deepcopy(POLICY)
        self.policy['owner_decisions']['promotions']=[{'code':'FICTIONAL26','version':'audit-fixture-v1','verified':True,
            'starts_on':'2026-10-01','ends_on':'2026-10-31','services':['deep'],
            'terms':'Fictional approved offer for this audit only; no actual campaign.'}]
    def check(self,**kwargs):
        values={'policy':self.policy,'code':'FICTIONAL26','service':'deep','on_date':date(2026,10,8),'customer_mentioned':True}
        return promotion_status(**(values|kwargs))
    def test_customer_mentioned_active_eligible_offer_and_inclusive_dates(self):
        for day in [1,8,31]:self.assertTrue(self.check(on_date=date(2026,10,day))['offer'])
        self.assertFalse(self.check(customer_mentioned=False)['offer'])
        self.assertFalse(self.check()['applied'])
    def test_unknown_expired_ineligible_and_stacking_never_offered(self):
        cases=[({'code':'UNKNOWN'},'manager_verification'),({'on_date':date(2026,11,1)},'inactive_on_date'),
               ({'service':'move'},'ineligible_service'),({'already_applied':True},'no_automatic_stacking')]
        for kwargs,status in cases:
            self.assertEqual(self.check(**kwargs)['status'],status);self.assertFalse(self.check(**kwargs)['offer'])
        self.assertFalse(promotion_status(POLICY,'FALL26','deep',date(2026,10,8),customer_mentioned=True)['offer'])
    def test_missing_or_conflicting_verified_terms_fail_to_manager(self):
        self.policy['owner_decisions']['promotions'][0]['verified']=False
        self.assertEqual(self.check()['status'],'manager_verification')
    def test_discount_response_and_priority_do_not_turn_no_response_into_dialogue(self):
        from .owner_decisions import DISCOUNT_RESPONSE,DECISIONS
        from .sales_content import OBJECTIONS
        self.assertIn(DISCOUNT_RESPONSE,OBJECTIONS['discount']['response'])
        self.assertNotIn('no_response',OBJECTIONS)
        self.assertFalse(DECISIONS['ideal_is_exclusion_rule'])

    def test_promotion_scenario_grades_only_verified_response_without_terms_invention(self):
        from .sales_scenarios import scenario_snapshot
        from .sales_content import PERSONAS
        # Fixed date via a fake datetime; test catalog has no real campaign terms.
        clock=Mock();clock.now.return_value.date.return_value=date(2026,10,8)
        with patch.dict(PERSONAS['promotion_question'],{'mentioned_promotion':'FICTIONAL26'}),patch('training.sales_scenarios.datetime',clock):
            for service,day,status in [('deep',8,'eligible_active'),('move',8,'ineligible_service'),('deep',31,'eligible_active')]:
                clock.now.return_value.date.return_value=date(2026,10,day)
                with patch.dict(PERSONAS['promotion_question'],{'service':service}):
                    a=local_attempt('promotion_question');a.policy=deepcopy(self.policy)
                    a.scenario=scenario_snapshot('promotion_question','intermediate',policy=a.policy)
                    self.assertEqual(a.scenario['promotion_check']['status'],status)
                    discovery(a);concerns(a);turn(a,'escalate');notes(a,'escalation')
                    feedback=validate_sales_outcome(a)
                    self.assertFalse(feedback['violations']);self.assertFalse(feedback['simulated_sale'])
                    response=a.scenario['objection_bank'][0]['response']
                    self.assertIn('Fictional approved offer' if status=='eligible_active' else 'not eligible',response)
            clock.now.return_value.date.return_value=date(2026,11,1)
            self.assertEqual(scenario_snapshot('promotion_question',policy=self.policy)['promotion_check']['status'],'inactive_on_date')
            self.assertEqual(scenario_snapshot('promotion_question',policy=POLICY)['promotion_check']['status'],'manager_verification')
