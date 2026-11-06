from copy import deepcopy
from pathlib import Path
import hashlib,json,struct,wave
from unittest.mock import patch
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from django.urls import reverse
from django.utils import timezone
from .actor import ACTIONS, CLIPS, LEGACY_ACTIONS, LEGACY_CLIPS, VOICE_VERSION
from .models import Assignment, Attempt, Profile, UsageEntry
from .providers import LocalVoice, ProviderDisabled
from .tests import PilotCase


class TrainingPathTests(PilotCase):
    def test_guided_path_and_honest_practice_availability(self):
        self.sign_as()
        response=self.client.get(reverse('course',args=[self.assignment.pk]))
        for text in ['Your next step, all in one place.','Your four stages','Start learning','Training home']:
            self.assertContains(response,text)
        response=self.client.get(reverse('practice_library',args=[self.assignment.pk]))
        self.assertContains(response,'Guided simulation · Prerecorded customer')
        self.assertContains(response,'Follow-up workflow')
        self.assertContains(response,'New live calls are currently disabled.')

    def test_service_progress_is_idempotent_and_preserves_existing_progress(self):
        self.sign_as()
        stamp=timezone.now()
        Assignment.objects.filter(pk=self.assignment.pk).update(welcome_completed_at=stamp,lesson_completed_at=stamp,company_introduction='Saved introduction')
        url=reverse('services',args=[self.assignment.pk])
        self.assertEqual(self.client.get(url).status_code,200)
        self.assignment.refresh_from_db();self.assertIsNone(self.assignment.services_completed_at)
        self.assertRedirects(self.client.post(url),reverse('practice_library',args=[self.assignment.pk]))
        self.assignment.refresh_from_db();completed=self.assignment.services_completed_at
        self.client.post(url)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.services_completed_at,completed)
        self.assertEqual(self.assignment.welcome_completed_at,stamp)
        self.assertEqual(self.assignment.lesson_completed_at,stamp)
        self.assertEqual(self.assignment.company_introduction,'Saved introduction')

    def test_new_paths_deny_other_learners_and_trainer_writes(self):
        other=get_user_model().objects.create_user(username='path-other@example.invalid')
        Profile.objects.create(user=other,role='learner')
        self.sign_as(other)
        for view in ['services','practice_library']:
            self.assertEqual(self.client.get(reverse(view,args=[self.assignment.pk])).status_code,403)
        self.assertEqual(self.client.post(reverse('services',args=[self.assignment.pk])).status_code,403)
        self.sign_as(self.trainer)
        self.assertEqual(self.client.get(reverse('services',args=[self.assignment.pk])).status_code,200)
        self.assertEqual(self.client.post(reverse('services',args=[self.assignment.pk])).status_code,403)

    def test_services_page_has_current_prices_and_approved_rules(self):
        self.sign_as()
        response=self.client.get(reverse('services',args=[self.assignment.pk]))
        for text in ['$200','$220','$265','$570','$620','48 hours','more than 30 days','larger than 4,000','8:05 AM','room-by-room checklist has not been verified']:
            self.assertContains(response,text)
        self.assertNotContains(response,'after-hours first-response timing')

    def test_services_recommendation_adds_no_new_practice_lock(self):
        attempt=self.prepare()
        self.assignment.refresh_from_db()
        self.assertIsNone(self.assignment.services_completed_at)
        self.assertEqual(attempt.status,'active')
        response=self.client.get(reverse('practice_library',args=[self.assignment.pk]))
        self.assertContains(response,reverse('attempt',args=[attempt.pk]))
        self.assertContains(response,'Resume practice')

    def test_invalid_notes_keep_input_and_do_not_save_or_duplicate(self):
        attempt=self.prepare()
        self.mutate(attempt,op='turn',action='discover')
        attempt.refresh_from_db();before=deepcopy(attempt.transcript);revision=attempt.revision
        response=self.crm(attempt,initial_quote='',needs='Kitchen shelves need attention')
        self.assertEqual(response.status_code,200)
        self.assertContains(response,'Kitchen shelves need attention')
        self.assertContains(response,'Please check the highlighted fields')
        attempt.refresh_from_db()
        self.assertEqual(attempt.transcript,before)
        self.assertEqual(attempt.revision,revision)
        self.assertEqual(attempt.crm,{})
        self.crm(attempt,needs='Kitchen shelves need attention')
        self.assertRedirects(self.client.post(reverse('start',args=[self.assignment.pk])),reverse('attempt',args=[attempt.pk]))
        response=self.client.get(reverse('attempt',args=[attempt.pk]))
        self.assertContains(response,'Kitchen shelves need attention')
        self.assertContains(response,'These practice notes stay on this Mac.')

    def test_current_attempt_keeps_its_script_after_future_copy_changes(self):
        attempt=self.prepare()
        expected=attempt.scenario['customer_lines']['discover']
        trainee=attempt.scenario['trainee_lines']['discover']
        with patch.dict(CLIPS,{'discover':'Future customer line'}),patch.dict(ACTIONS,{'discover':('Label','Future trainee line')}):
            self.mutate(attempt,op='turn',action='discover')
        attempt.refresh_from_db()
        self.assertEqual(attempt.transcript[-1]['text'],expected)
        self.assertEqual(attempt.transcript[-2]['text'],trainee)
        response=self.client.get(reverse('attempt',args=[attempt.pk]))
        self.assertContains(response,'/audio/'+VOICE_VERSION+'/discover.wav')
        self.assertEqual(UsageEntry.objects.filter(attempt=attempt,activity='customer_fixture').get().model,'macOS-Samantha-prerecorded-'+VOICE_VERSION.rsplit('-',1)[-1])

    def test_legacy_attempt_keeps_original_script_audio_and_snapshot(self):
        attempt=self.prepare()
        old=deepcopy(attempt.scenario)
        for key in ['customer_lines','trainee_lines','audio_version']:old.pop(key)
        old['version']='inbound-2000-v1'
        original=[{'id':'turn-1','speaker':'Customer','text':LEGACY_CLIPS['opening'],'clip':'opening'}]
        Attempt.objects.filter(pk=attempt.pk).update(scenario=old,transcript=original)
        self.mutate(attempt,op='turn',action='discover')
        attempt.refresh_from_db()
        self.assertEqual(attempt.scenario,old)
        self.assertEqual(attempt.transcript[0],original[0])
        self.assertEqual(attempt.transcript[-1]['text'],LEGACY_CLIPS['discover'])
        self.assertEqual(attempt.transcript[-2]['text'],LEGACY_ACTIONS['discover'][1])
        response=self.client.get(reverse('attempt',args=[attempt.pk]))
        self.assertContains(response,'/audio/discover.wav')
        self.assertNotContains(response,'/audio/samantha-v2/')


class AudioVersionTests(SimpleTestCase):
    def test_current_recordings_match_manifest_and_contain_pcm_audio(self):
        root=settings.BASE_DIR/'training/static/training/audio'
        manifest=json.loads((root/VOICE_VERSION/'manifest.json').read_text())
        self.assertEqual(manifest['scripts'],CLIPS)
        self.assertEqual(manifest['voice'],'Samantha')
        for clip in CLIPS:
            path=root/VOICE_VERSION/(clip+'.wav')
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),manifest['recordings'][clip]['sha256'])
            with wave.open(str(path),'rb') as stream:
                self.assertEqual(stream.getsampwidth(),2)
                self.assertEqual(stream.getframerate(),24000)
                self.assertGreater(stream.getnframes()/stream.getframerate(),1)
                samples=struct.unpack('<'+'h'*(stream.getnframes()*stream.getnchannels()),stream.readframes(stream.getnframes()))
                self.assertGreater(max(abs(value) for value in samples),100)
        for voice in ['samantha','karen','daniel']:
            with wave.open(str(root/'previews-v2'/(voice+'.wav')),'rb') as stream:
                self.assertGreater(stream.getnframes(),24000)

    def test_unknown_audio_paths_are_rejected(self):
        for clip,version in [('../config/settings','legacy'),('opening','../../'),('made-up','samantha-v2')]:
            with self.assertRaises(ProviderDisabled):LocalVoice().audio_url(clip,version)

class DraftPreservationTests(PilotCase):
    def test_stale_crm_after_submission_retains_notes_without_changing_evidence(self):
        attempt=self.prepare();self.mutate(attempt,op='turn',action='discover');attempt.refresh_from_db();old_revision=attempt.revision
        self.mutate(attempt,op='submit');attempt.refresh_from_db();before=deepcopy(attempt.transcript)
        response=self.client.post(reverse('mutate_attempt',args=[attempt.pk]),{'revision':old_revision,'op':'crm',
            'customer':'Taylor Sample','sqft':2000,'service':'biweekly','needs':'Kitchen counters and bathroom shelves are the priorities.',
            'initial_quote':570,'recurring_quote':220,'disposition':'request','follow_up':'Ask the manager to confirm timing before promising a visit.'})
        self.assertContains(response,'Unsaved notes from this tab',status_code=409)
        self.assertContains(response,'Kitchen counters and bathroom shelves',status_code=409)
        attempt.refresh_from_db();self.assertEqual(attempt.transcript,before);self.assertEqual(attempt.crm,{})
    def test_stale_active_crm_can_be_reviewed_and_resubmitted_explicitly(self):
        attempt=self.prepare();old_revision=attempt.revision;self.mutate(attempt,op='turn',action='discover')
        response=self.client.post(reverse('mutate_attempt',args=[attempt.pk]),{'revision':old_revision,'op':'crm',
            'customer':'Taylor Sample','sqft':2000,'service':'biweekly','needs':'Keep my unsaved priority note available.',
            'initial_quote':570,'recurring_quote':220,'disposition':'request','follow_up':'Team confirms availability.'})
        self.assertContains(response,'Keep my unsaved priority note available.',status_code=409)
        attempt.refresh_from_db();self.assertEqual(attempt.crm,{})
        self.assertEqual(self.crm(attempt,needs='Keep my unsaved priority note available.').status_code,302)
