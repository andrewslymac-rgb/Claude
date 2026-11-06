import array
import copy
import hashlib
import json
from pathlib import Path
import tempfile
from unittest.mock import Mock
import wave
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from .combined_audio import RATE, LIMIT, MixUnavailable, ensure_combined, mix_pcm, placements, combined_status
from .live_runtime import CallSession, TimelineAudio
from .live_provider import conversation_config
from .models import LiveCall, Profile
from .tests import PilotCase


def write_wav(path, samples, rate=RATE):
    with wave.open(str(path), 'wb') as audio:
        audio.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
        audio.writeframes(array.array('h', samples).tobytes())


class MixTests(SimpleTestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def metadata(self):
        return {'audio_timeline': {'version':1,'rate':RATE,'end_frame':240,
            'input_segments':[{'source_start':0,'frames':240,'timeline_start':0}],
            'output_segments':[{'event_id':2,'source_start':0,'frames':240}]},
            'playback':[{'audio_event_id':2,'scheduled_frame':0,'frames':240}]}

    def test_legacy_approximate_cache_is_never_served(self):
        for name in ('learner','customer'): write_wav(self.root/(name+'.wav'),[1000]*240)
        (self.root/'combined.wav').write_bytes(b'old guessed mix preserved')
        self.assertIsNone(combined_status(self.root,{}))
        self.assertEqual((self.root/'combined.wav').read_bytes(),b'old guessed mix preserved')

    def test_browser_render_capture_used_without_remixing(self):
        from .combined_audio import browser_recording
        write_wav(self.root/'browser-conversation.wav',[500]*240)
        evidence={'browser_recording':{'version':1,'rate':RATE,'frames':240,'complete':True}}
        result=ensure_combined(self.root,evidence)
        self.assertEqual(result['quality'],'browser_render')
        self.assertEqual(result['filename'],'browser-conversation.wav')
        self.assertFalse((self.root/'combined.wav').exists())
        evidence['browser_recording']['complete']=False
        self.assertIsNone(combined_status(self.root,evidence))

    def track(self, samples, rate=RATE):
        return array.array('h', samples), rate, 'fixture'

    def decoded(self, data):
        return list(array.array('h', data))

    def test_unequal_tracks_keep_silence_and_overlap_not_concatenation(self):
        tracks = {'learner': self.track([1000] * 4), 'customer': self.track([2000] * 2)}
        pcm, frames = mix_pcm(tracks, {'learner': [(0, 4, 2)], 'customer': [(0, 2, 4)]})
        self.assertEqual(frames, 6)
        self.assertEqual(self.decoded(pcm), [0, 0, 500, 500, 1500, 1500])

    def test_capture_gap_and_explicit_end_preserved(self):
        tracks = {'learner': self.track([1000] * 4), 'customer': self.track([2000] * 4)}
        pcm, frames = mix_pcm(tracks, {'learner': [(0, 2, 0), (2, 2, 6)], 'customer': [(0, 4, 7)]}, end=9)
        self.assertEqual(self.decoded(pcm), [500, 500, 0, 0, 0, 0, 500, 1500, 1000])

    def test_overlaps_do_not_clip_full_scale(self):
        tracks = {name: self.track([32767, -32768]) for name in ('learner', 'customer')}
        pcm, _ = mix_pcm(tracks, {name: [(0, 2, 0)] for name in tracks})
        self.assertEqual(self.decoded(pcm), [32767, -32768])

    def test_different_sample_rates_use_time_not_sample_index(self):
        tracks = {'learner': self.track([1000]*8000, 8000), 'customer': self.track([2000]*48000, 48000)}
        pcm, frames = mix_pcm(tracks, {'learner': [(0, 8000, RATE)], 'customer': [(0, 48000, 0)]})
        samples = self.decoded(pcm)
        self.assertEqual(frames, 2*RATE)
        self.assertEqual(samples[:RATE], [1000]*RATE)
        self.assertEqual(samples[RATE:], [500]*RATE)

    def test_shared_mix_sources_private_and_unchanged(self):
        for name in ('learner', 'customer'):
            write_wav(self.root/(name+'.wav'), [1000] * 240)
        before = {f.name: f.read_bytes() for f in self.root.glob('*.wav')}
        report = ensure_combined(self.root, self.metadata())
        self.assertEqual(report['quality'], 'shared_clock')
        self.assertEqual(report['seconds'], .01)
        for name, raw in before.items(): self.assertEqual((self.root/name).read_bytes(), raw)
        for name in ('combined.wav', 'combined.json'):
            self.assertEqual((self.root/name).stat().st_mode & 0o777, 0o600)
        times = [(self.root/name).stat().st_mtime_ns for name in ('combined.wav', 'combined.json')]
        self.assertEqual(ensure_combined(self.root, self.metadata()), report)
        self.assertEqual(times, [(self.root/name).stat().st_mtime_ns for name in ('combined.wav', 'combined.json')])

    def test_missing_track_does_not_synthesize_customer(self):
        write_wav(self.root/'learner.wav', [1000]*240)
        self.assertIsNone(combined_status(self.root, {}))
        self.assertFalse((self.root/'combined.wav').exists())

    def test_source_symlink_rejected(self):
        write_wav(self.root/'customer.wav', [1000]*240)
        (self.root/'learner.wav').symlink_to(self.root/'customer.wav')
        self.assertIsNone(combined_status(self.root, {}))

    def test_corrupt_cache_rebuilt_without_modifying_sources(self):
        for name in ('learner', 'customer'): write_wav(self.root/(name+'.wav'), [1000]*240)
        report = ensure_combined(self.root, self.metadata())
        (self.root/'combined.wav').write_bytes(b'broken')
        self.assertEqual(ensure_combined(self.root, self.metadata()), report)

    def shared(self):
        tracks = {'learner': self.track([1000]*4), 'customer': self.track([0, 0, 2000, 2000])}
        evidence = {'audio_timeline': {'version':1, 'rate':RATE, 'end_frame':10,
            'input_segments':[{'source_start':0, 'frames':4, 'timeline_start':2}],
            'output_segments':[{'event_id':2, 'source_start':2, 'frames':2}]},
            'playback':[{'audio_event_id':2, 'scheduled_frame':5, 'frames':2}]}
        return tracks, evidence

    def test_shared_clock_replaces_receipt_padding_with_scheduled_playback(self):
        tracks, evidence = self.shared()
        mapping, quality, end, missing = placements(tracks, evidence)
        self.assertEqual((quality, end, missing), ('shared_clock', 10, 0))
        self.assertEqual(self.decoded(mix_pcm(tracks, mapping, end)[0]), [0,0,500,500,500,1500,1000,0,0,0])

    def test_unscheduled_customer_audio_not_invented(self):
        tracks, evidence = self.shared(); evidence['playback'] = []
        mapping, quality, end, missing = placements(tracks, evidence)
        self.assertEqual((quality, missing), ('shared_clock_partial', 1))
        self.assertEqual(mapping['customer'], [])

    def test_missing_stop_time_is_partial(self):
        tracks, evidence = self.shared(); evidence['audio_timeline']['end_frame'] = None
        self.assertEqual(placements(tracks, evidence)[1], 'shared_clock_partial')

    def test_invalid_or_incomplete_timing_fails_instead_of_guessing(self):
        for key, value in [('timeline_start', -1), ('frames', 5), ('source_start', 1), ('timeline_start', True)]:
            tracks, evidence = self.shared(); evidence['audio_timeline']['input_segments'][0][key] = value
            with self.assertRaises(MixUnavailable): placements(tracks, evidence)
        tracks, evidence = self.shared(); evidence['audio_timeline']['capture_missing'] = True
        with self.assertRaises(MixUnavailable): placements(tracks, evidence)

    def test_output_clock_duplicate_ack_idempotent_conflict_rejected(self):
        tracks, evidence = self.shared(); evidence['playback'] *= 2
        self.assertEqual(placements(tracks, evidence)[1], 'shared_clock')
        evidence['playback'][1] = {**evidence['playback'][1], 'scheduled_frame': 6}
        with self.assertRaises(MixUnavailable): placements(tracks, evidence)

    def test_session_capture_clock_validation_and_retry(self):
        session = CallSession('test', Mock(), {}, self.root, Mock(), clock=lambda: 1)
        session.state='active'; session.ready_at=0
        session.accept_audio(b'\0\0'*100, 0, 200)
        session.accept_audio(b'\0\0'*100, 0, 200)
        self.assertEqual(session.input_queue.qsize(), 1)
        for frame in (True, -1, LIMIT, 250):
            with self.assertRaises(ValueError): session.accept_audio(b'\0\0'*100, 1, frame)
        session.note_end(300); session.note_end(300)
        with self.assertRaises(ValueError): session.note_end(301)


class CombinedViewTests(PilotCase):
    def setUp(self):
        self.attempt = self.prepare()
        self.attempt.status='submitted'; self.attempt.save()
        self.call = LiveCall.objects.create(attempt=self.attempt, state='closed', model='offline-fixture', voice='fixture', evidence=MixTests.metadata(self))
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.override = override_settings(LIVE_RECORDING_DIR=temporary.name); self.override.enable(); self.addCleanup(self.override.disable)
        self.root = Path(temporary.name)/str(self.attempt.pk); self.root.mkdir()
        for name in ('learner', 'customer'): write_wav(self.root/(name+'.wav'), [1000]*240)
        self.url = reverse('live_audio', args=[self.attempt.pk, 'combined'])

    def test_combined_main_player_and_originals_present(self):
        response = self.client.get(reverse('live_detail', args=[self.attempt.pk]))
        self.assertContains(response, 'id="full-call-audio"')
        self.assertContains(response, 'shared recording and playback clock')
        self.assertContains(response, 'data-recording-track="learner"')
        self.assertContains(response, 'review-audio.js')

    def test_learner_trainer_admin_ranges_and_head(self):
        for user in (self.learner, self.trainer, self.admin):
            self.sign_as(user)
            response = self.client.get(self.url, HTTP_RANGE='bytes=44-47')
            self.assertEqual(response.status_code, 206)
            self.assertEqual(response['Content-Length'], '4')
            self.assertEqual(response['Cache-Control'], 'no-store')
            self.assertEqual(b''.join(response.streaming_content), (self.root/'combined.wav').read_bytes()[44:48]); response.close()
            response = self.client.head(self.url)
            self.assertEqual(response.status_code, 200); self.assertEqual(response.content, b''); response.close()

    def test_range_suffix_open_and_invalid(self):
        ensure_combined(self.root, self.call.evidence)
        content = (self.root/'combined.wav').read_bytes()
        for requested, expected in [('bytes=-10', content[-10:]), ('bytes=44-', content[44:])]:
            response = self.client.get(self.url, HTTP_RANGE=requested)
            self.assertEqual(response.status_code, 206); self.assertEqual(b''.join(response.streaming_content), expected); response.close()
        for requested in ('bytes=999999-', 'bytes=10-4', 'bytes=-0', 'bytes=', 'bytes=1-2,4-5'):
            self.assertEqual(self.client.get(self.url, HTTP_RANGE=requested).status_code, 416)

    def test_unauthenticated_and_other_learner_denied(self):
        from django.contrib.auth import get_user_model
        self.client.logout(); self.assertEqual(self.client.get(self.url).status_code, 302)
        other = get_user_model().objects.create_user('foreign', email='foreign@example.invalid')
        Profile.objects.create(user=other, role='learner', invited=True)
        self.sign_as(other)
        for track in ('combined', 'learner', 'customer'):
            self.assertEqual(self.client.get(reverse('live_audio', args=[self.attempt.pk, track])).status_code, 403)
        self.assertFalse((self.root/'combined.wav').exists())

    def test_missing_original_and_active_recording_no_combined_access(self):
        (self.root/'customer.wav').unlink()
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertContains(self.client.get(reverse('live_detail', args=[self.attempt.pk])), 'Separate playback only.')
        LiveCall.objects.filter(pk=self.attempt.pk).update(state='active')
        self.assertEqual(self.client.get(self.url).status_code, 404)
