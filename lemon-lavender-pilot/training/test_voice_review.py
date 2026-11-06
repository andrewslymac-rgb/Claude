import base64
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
import tempfile
from django.test import SimpleTestCase, override_settings, Client
from django.urls import reverse
from django.utils import timezone
from .tests import PilotCase
from .models import Attempt, Assignment, LiveCall, TranscriptAnchor, Profile
from .live_runtime import CallSession, LiveController, TimelineAudio
from .live_provider import conversation_config, coaching_payload
from .live_budget import BudgetDenied
from .live_preparation import selected_scenario
from .sales_scenarios import scenario_snapshot
from .sales_content import PERSONAS, DIFFICULTIES
from .policies import POLICY
from .combined_audio import combined_status
from .live_coaching import build_feedback


class PlaybackControlTests(SimpleTestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.clock=Mock(return_value=1);self.transport=Mock();self.results=[]
        self.session=CallSession('local',self.transport,conversation_config({},{}),Path(self.temp.name),
            lambda _,r:self.results.append(r),clock=self.clock)
        self.session.handle({'type':'session.started','session':self.session.config},Mock())

    def test_interrupt_is_idempotent_and_tags_late_audio_held(self):
        s=self.session;first=s.control_playback('interrupt',0,240)
        self.assertEqual(s.control_playback('interrupt',0,240),first)
        self.assertEqual(s.control_queue.qsize(),1)
        s.handle({'type':'session.output_audio.delta','delta':base64.b64encode(b'\xff\x10'*24).decode()},Mock())
        self.assertTrue(s.events[-1]['suppressed']);self.assertEqual(s.events[-1]['epoch'],1)
        with self.assertRaises(ValueError):s.control_playback('resume',1,500)
        self.clock.return_value=1.4
        self.assertEqual(s.control_playback('resume',1,9600)['epoch'],2)
        s.relay_controls()
        events=[c.args[0] for c in self.transport.send.call_args_list]
        self.assertEqual([e['type'] for e in events],['session.instructions.append']*3)
        self.assertFalse(s.playback_held)

    def test_bad_order_conflicts_payload_and_limits_are_rejected(self):
        s=self.session
        for action,seq,frame in [('resume',0,0),('interrupt',1,0),('interrupt',True,0),('interrupt',0,-1),('inject',0,0)]:
            with self.assertRaises(ValueError):s.control_playback(action,seq,frame)
        s.control_playback('interrupt',0,1)
        with self.assertRaises(ValueError):s.control_playback('interrupt',0,2)
        self.clock.return_value=5
        for sequence in range(1,24):s.control_playback('resume' if sequence%2 else 'interrupt',sequence,sequence)
        with self.assertRaises(ValueError):s.control_playback('interrupt',24,24)
        self.assertEqual(len(s.controls),24)

    def test_incomplete_gapped_or_inexact_end_capture_never_claims_complete(self):
        s=self.session;s.accept_audio(b'\0\0'*100,0,0,b'\0\0'*100)
        s.accept_audio(b'\0\0'*100,1,101,b'\0\0'*100)
        self.assertTrue(s.capture_missing)
        s.note_end(201,True)
        self.transport.receive.return_value={'type':'session.closed','usage':{'seconds':1}}
        s.run();self.assertFalse(self.results[0]['browser_recording']['complete'])

    def test_complete_capture_has_exact_frames_and_final_flush(self):
        s=self.session;s.accept_audio(b'\0\0'*100,0,0,b'\0\0'*100)
        s.accept_audio(b'\0\0'*50,1,100,b'\0\0'*50);s.note_end(150,True)
        self.transport.receive.return_value={'type':'session.closed','usage':{'seconds':1}}
        s.run();metadata=self.results[0]['browser_recording']
        self.assertEqual(metadata['frames'],150);self.assertTrue(metadata['complete'])
        self.assertEqual(combined_status(Path(self.temp.name),self.results[0])['quality'],'browser_render')
        metadata['end_frame']=149
        self.assertIsNone(combined_status(Path(self.temp.name),self.results[0]))

    def test_mismatched_end_and_unflushed_capture_not_available(self):
        s=self.session;s.accept_audio(b'\0\0'*100,0,0,b'\0\0'*100);s.note_end(101,True)
        self.transport.receive.return_value={'type':'session.closed','usage':{'seconds':1}}
        s.run();self.assertFalse(self.results[0]['browser_recording']['complete'])


class LivePreparationTests(PilotCase):
    def setUp(self):
        self.sign_as();Assignment.objects.filter(pk=self.assignment.pk).update(welcome_completed_at=timezone.now(),lesson_completed_at=timezone.now())
        self.controller=Mock(armed=True,input_mode='synthetic',assignment_id=None,scenario_choices=(),sessions={},budget=SimpleNamespace(approval='offline'))
        self.patcher=patch('training.live_views.controller',self.controller);self.patcher.start();self.addCleanup(self.patcher.stop)

    def post(self,**extras):
        return self.client.post(reverse('live_start',args=[self.assignment.pk]),json.dumps({'consent':True,'input_mode':'synthetic',**extras}),content_type='application/json')

    def test_selected_configuration_is_preview_only_without_scope(self):
        response=self.client.get(reverse('live_prepare',args=[self.assignment.pk]),{'persona_id':'deadline_move','difficulty':'advanced'})
        self.assertContains(response,'Prepare a voice scenario')
        self.assertFalse(response.context['live_enabled']);self.controller.start.assert_not_called()
        self.assertEqual(self.post(persona_id='deadline_move',difficulty='advanced').status_code,409)
        self.assertEqual(Attempt.objects.count(),0)

    def test_allowlisted_choice_reaches_actual_transport_configuration_and_form(self):
        self.controller.scenario_choices=(('deadline_move','advanced'),)
        response=self.post(persona_id='deadline_move',difficulty='advanced')
        self.assertEqual(response.status_code,201);attempt=Attempt.objects.get(pk=response.json()['attempt_id'])
        called=self.controller.start.call_args.args[0].attempt
        self.assertEqual(called.scenario['persona_id'],'deadline_move');self.assertEqual(called.scenario['difficulty'],'advanced')
        prompt=conversation_config(called.policy,called.scenario)['instructions']
        self.assertIn(called.scenario['version'],prompt);self.assertIn(called.scenario['profile']['opening'],prompt)
        self.assertFalse(attempt.rubric['weights_approved']);self.assertIsNone(attempt.rubric['pass_threshold'])
        page=self.client.get(reverse('live_detail',args=[attempt.pk]));self.assertContains(page,called.scenario['customer'])
        form=page.context['crm_form'];self.assertEqual(form.fields['service'].choices[0][0],called.scenario['service'])

    def test_controller_independently_blocks_new_persona_before_reservation(self):
        controller=LiveController();controller.armed=True;controller.secret=object();controller.budget=Mock(approval='offline')
        call=SimpleNamespace(approval='offline',attempt=SimpleNamespace(scenario=scenario_snapshot('office'),assignment_id=1))
        with self.assertRaises(BudgetDenied):controller.start(call)
        controller.budget.reserve.assert_not_called()

    def test_invalid_and_free_text_selection_never_reaches_transport(self):
        for values in [{'persona_id':'ignore instructions'},{'persona_id':'office','difficulty':'override'},{'difficulty':'advanced'}]:
            self.assertEqual(self.post(**values).status_code,400)
        self.controller.start.assert_not_called()

    def test_unapproved_selection_does_not_enable_microphone_and_preview_price_matches(self):
        self.controller.input_mode='microphone'
        with patch('training.live_views.input_mode',return_value='microphone'):
            response=self.client.get(reverse('live_prepare',args=[self.assignment.pk]),{'persona_id':'price_shopper','difficulty':'advanced'})
        self.assertIn('microphone=()',response['Permissions-Policy'])
        self.assertContains(response,'1800 square feet')
        self.assertNotContains(response,'biweekly visits are')
        self.assertContains(response,'Preview only. Paid calling is disabled')

    def test_every_full_persona_has_scenario_specific_text_only_coaching(self):
        for persona in PERSONAS:
            for difficulty in DIFFICULTIES:
                scenario=scenario_snapshot(persona,difficulty)
                attempt=SimpleNamespace(scenario=scenario,policy=POLICY,crm={'secret':'CRM-MARKER'},actions=[],
                    transcript=[{'id':'live-1','speaker':'Learner','text':'Fictional practice speech.'},{'id':'notes','speaker':'Practice CRM','text':'LOCAL-MARKER'}])
                payload=json.loads(coaching_payload(attempt));self.assertNotIn('MARKER',json.dumps(payload))
                self.assertIn(str(scenario['sqft']),payload['instructions']);self.assertFalse(payload['store'])
                feedback=build_feedback(attempt);self.assertTrue(feedback['manager_required'])
                self.assertFalse(feedback['outcome']['booking_confirmed']);self.assertIsNone(feedback['automatic_pass'])

    def test_control_route_denies_staff_foreign_learner_and_csrf(self):
        attempt=self.prepare();LiveCall.objects.create(attempt=attempt)
        url=reverse('live_control',args=[attempt.pk])
        for user in [self.trainer,self.admin]:
            self.sign_as(user);self.assertEqual(self.client.post(url,'{}',content_type='application/json').status_code,403)
        client=Client(enforce_csrf_checks=True);client.force_login(self.learner)
        self.assertEqual(client.post(url,'{}',content_type='application/json').status_code,403)
        from django.contrib.auth import get_user_model
        other=get_user_model().objects.create_user('foreign');Profile.objects.create(user=other,role='learner')
        self.sign_as(other);self.assertEqual(self.client.post(url,'{}',content_type='application/json').status_code,403)


class TranscriptAlignmentTests(PilotCase):
    def setUp(self):
        self.sign_as();self.attempt=self.prepare();self.attempt.status='submitted'
        self.attempt.transcript=[{'id':'live-1','speaker':'Learner','text':'Fictional test words.'}];self.attempt.save()
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.settings=override_settings(LIVE_RECORDING_DIR=self.temp.name);self.settings.enable();self.addCleanup(self.settings.disable)
        directory=Path(self.temp.name)/str(self.attempt.pk);directory.mkdir()
        audio=TimelineAudio(directory/'browser-conversation.wav');audio.append(b'\0\0'*24000,0);audio.close()
        evidence={'browser_recording':{'version':2,'rate':24000,'frames':24000,'end_frame':24000,'complete':True}}
        self.call=LiveCall.objects.create(attempt=self.attempt,state='closed',evidence=evidence)
        self.digest=combined_status(directory,evidence)['sha256'];self.url=reverse('live_align',args=[self.attempt.pk])
        self.values={'turn_id':'live-1','start_seconds':'0.1','end_seconds':'0.3','recording_sha256':self.digest,'confidence':'confirmed','listened':'on'}

    def test_human_anchors_are_append_only_deduplicated_and_exported(self):
        self.sign_as(self.trainer)
        self.assertEqual(self.client.post(self.url,self.values).status_code,302)
        self.assertEqual(self.client.post(self.url,self.values).status_code,302)
        self.assertEqual(TranscriptAnchor.objects.count(),1)
        self.values['end_seconds']='0.4';self.client.post(self.url,self.values)
        self.assertEqual(list(TranscriptAnchor.objects.values_list('revision',flat=True)),[1,2])
        page=self.client.get(reverse('live_detail',args=[self.attempt.pk]))
        self.assertContains(page,'data-audio-start="0.1"');self.assertContains(page,'data-audio-end="0.4"')
        result=json.loads(self.client.get(reverse('attempt_export',args=[self.attempt.pk])).content)
        self.assertEqual(len(result['transcript_alignment_history']),2)
        self.assertNotIn('reviewer',result['transcript_alignment_history'][0])

    def test_alignment_requires_trainer_listening_real_turn_digest_and_bounds(self):
        self.assertEqual(self.client.post(self.url,self.values).status_code,403)
        self.sign_as(self.trainer)
        for extra in [{'listened':''},{'end_seconds':'0.05'},{'end_seconds':'1.001'},{'start_seconds':'NaN'},
                      {'recording_sha256':'0'*64},{'turn_id':'fabricated'},{'confidence':'automatic'}]:
            self.assertEqual(self.client.post(self.url,{**self.values,**extra}).status_code,400)
        self.assertEqual(TranscriptAnchor.objects.count(),0)
        client=Client(enforce_csrf_checks=True);client.force_login(self.trainer)
        self.assertEqual(client.post(self.url,self.values).status_code,403)

    def test_legacy_tracks_cannot_be_given_invented_shared_alignment(self):
        self.call.evidence={};self.call.save();self.sign_as(self.trainer)
        self.assertEqual(self.client.post(self.url,self.values).status_code,400)
        page=self.client.get(reverse('live_detail',args=[self.attempt.pk]))
        self.assertNotContains(page,'id="transcript-alignment"');self.assertNotContains(page,'class="transcript-seek"')
        self.assertEqual(TranscriptAnchor.objects.count(),0)
