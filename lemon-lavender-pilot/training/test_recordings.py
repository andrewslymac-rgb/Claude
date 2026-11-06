import io,struct,tempfile
from datetime import timedelta
from pathlib import Path
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from .models import Attempt,PracticeRecording,Profile
from .recordings import MAX_BYTES
from .tests import PilotCase

def wav(frames=2400,rate=24000):
    data=struct.pack('<h',1000)*frames
    return struct.pack('<4sI4s4sIHHIIHH4sI',b'RIFF',36+len(data),b'WAVE',b'fmt ',16,1,1,rate,rate*2,2,16,b'data',len(data))+data

class RecordingTests(PilotCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory(prefix='ll-recording-test-')
        self.settings_override=override_settings(RECORDING_DIR=Path(self.folder.name))
        self.settings_override.enable();self.addCleanup(self.settings_override.disable);self.addCleanup(self.folder.cleanup)
    def upload(self,attempt,data=None):
        return self.client.post(reverse('recording_save',args=[attempt.pk]),{'label':'Discovery answer','recording':SimpleUploadedFile('response.wav',data if data is not None else wav(),content_type='audio/wav')})
    def test_local_save_replay_idempotency_and_manager_access(self):
        attempt=self.prepare();self.assertEqual(self.upload(attempt).status_code,201)
        record=PracticeRecording.objects.get();path=Path(self.folder.name)/(str(record.pk)+'.wav')
        self.assertEqual(path.read_bytes(),wav());self.assertEqual(path.stat().st_mode&0o777,0o600)
        self.assertEqual(self.upload(attempt).status_code,200);self.assertEqual(PracticeRecording.objects.count(),1)
        url=reverse('recording_play',args=[record.pk]);response=self.client.get(url)
        self.assertEqual(b''.join(response.streaming_content),wav());self.assertEqual(response['Cache-Control'],'no-store')
        self.sign_as(self.trainer);self.assertEqual(self.client.get(url).status_code,200)
        self.assertEqual(self.upload(attempt).status_code,403)
    def test_other_learner_and_anonymous_cannot_read_recording(self):
        attempt=self.prepare();self.upload(attempt);record=PracticeRecording.objects.get()
        other=get_user_model().objects.create_user(username='other-record');Profile.objects.create(user=other,role='learner')
        self.sign_as(other)
        self.assertEqual(self.client.get(reverse('recording_play',args=[record.pk])).status_code,403)
        self.assertEqual(self.upload(attempt).status_code,403)
        self.client.logout();self.assertEqual(self.client.get(reverse('recording_play',args=[record.pk])).status_code,302)
    def test_malformed_oversized_and_expired_cannot_save(self):
        attempt=self.prepare()
        for data in [b'not audio',wav()+b'padding',wav(rate=96000),wav(frames=24001,rate=8000)[:45]]:
            self.assertEqual(self.upload(attempt,data).status_code,400)
        response=self.client.generic('POST',reverse('recording_save',args=[attempt.pk]),data=b'fake',CONTENT_LENGTH=str(MAX_BYTES+40000))
        self.assertEqual(response.status_code,413)
        Attempt.objects.filter(pk=attempt.pk).update(started_at=timezone.now()-timedelta(hours=2))
        self.assertEqual(self.upload(attempt).status_code,409);self.assertFalse(PracticeRecording.objects.exists())
        self.assertEqual(list(Path(self.folder.name).iterdir()),[])
    def test_submitted_freezes_new_clips_existing_remain_available(self):
        attempt=self.prepare();self.upload(attempt)
        Attempt.objects.filter(pk=attempt.pk).update(status='submitted')
        self.assertEqual(self.upload(attempt).status_code,200)
        self.assertEqual(self.upload(attempt,wav(frames=2401)).status_code,409)
        self.assertEqual(PracticeRecording.objects.count(),1)
    def test_clip_limit_and_microphone_only_on_attempt(self):
        attempt=self.prepare()
        for i in range(10):self.assertEqual(self.upload(attempt,wav(frames=2400+i)).status_code,201)
        self.assertEqual(self.upload(attempt,wav(frames=2500)).status_code,429)
        response=self.client.get(reverse('attempt',args=[attempt.pk]));self.assertIn('microphone=(self)',response['Permissions-Policy']);self.assertIn('camera=()',response['Permissions-Policy'])
        response=self.client.get(reverse('course',args=[self.assignment.pk]));self.assertIn('microphone=()',response['Permissions-Policy'])
        self.sign_as(self.trainer);response=self.client.get(reverse('attempt',args=[attempt.pk]));self.assertIn('microphone=()',response['Permissions-Policy'])
    def test_canonical_duration_boundary(self):
        from .recordings import validate_wav
        self.assertEqual(validate_wav(wav(frames=8000*120,rate=8000)),(8000*120,8000))
        with self.assertRaises(ValueError):validate_wav(wav(frames=8000*120+1,rate=8000))
    def test_save_confirmation_is_json_and_missing_stored_file_is_not_success(self):
        attempt=self.prepare();response=self.upload(attempt)
        self.assertEqual(response.status_code,201);self.assertTrue(response.json()['saved'])
        record=PracticeRecording.objects.get();self.assertEqual(response.json()['recording_id'],str(record.pk))
        (Path(self.folder.name)/(str(record.pk)+'.wav')).unlink()
        self.assertEqual(self.upload(attempt).status_code,503)
        self.assertEqual(PracticeRecording.objects.count(),1)
    def test_storage_failure_rolls_back_and_can_retry(self):
        from unittest.mock import patch
        from django.db import OperationalError
        attempt=self.prepare()
        from os import open as real_open
        def fail_recording_write(path,*args,**kwargs):
            if Path(path).parent==Path(self.folder.name):raise OSError('Private device details must not be exposed')
            return real_open(path,*args,**kwargs)
        with patch('training.recordings.os.open',side_effect=fail_recording_write):
            response=self.upload(attempt)
        self.assertEqual(response.status_code,503);self.assertNotContains(response,'Private device details',status_code=503)
        self.assertFalse(PracticeRecording.objects.exists())
        with patch('training.recordings.PracticeRecording.save',side_effect=OperationalError('Database unavailable')):
            response=self.upload(attempt)
        self.assertEqual(response.status_code,503);self.assertEqual(list(Path(self.folder.name).iterdir()),[])
        self.assertEqual(self.upload(attempt).status_code,201)
    def test_revoked_roles_cannot_access_private_audio_and_admin_can_read(self):
        attempt=self.prepare();self.upload(attempt);record=PracticeRecording.objects.get();url=reverse('recording_play',args=[record.pk])
        self.sign_as(self.admin);self.assertEqual(self.client.get(url).status_code,200)
        self.assertEqual(self.upload(attempt).status_code,403)
        self.sign_as(self.trainer);Profile.objects.filter(user=self.trainer).update(invited=False)
        self.assertEqual(self.client.get(url).status_code,403)
        self.sign_as();Profile.objects.filter(user=self.learner).update(invited=False)
        self.assertEqual(self.client.get(url).status_code,403);self.assertEqual(self.upload(attempt).status_code,403)
    def test_no_profile_denies_attempt_and_private_audio_without_server_error(self):
        attempt=self.prepare();self.upload(attempt);record=PracticeRecording.objects.get()
        unknown=get_user_model().objects.create_user(username='uninvited-without-profile')
        self.sign_as(unknown)
        self.assertEqual(self.client.get(reverse('recording_play',args=[record.pk])).status_code,403)
        self.assertEqual(self.client.get(reverse('attempt',args=[attempt.pk])).status_code,403)
    def test_upload_requires_csrf_and_cannot_be_read_as_static_file(self):
        from django.test import Client
        attempt=self.prepare();self.upload(attempt);record=PracticeRecording.objects.get()
        client=Client(enforce_csrf_checks=True);client.force_login(self.learner)
        response=client.post(reverse('recording_save',args=[attempt.pk]),{'recording':SimpleUploadedFile('response.wav',wav())})
        self.assertEqual(response.status_code,403)
        self.assertEqual(self.client.get('/static/training/recordings/'+str(record.pk)+'.wav').status_code,404)
        self.assertEqual(self.client.get('/.data/recordings/'+str(record.pk)+'.wav').status_code,404)
