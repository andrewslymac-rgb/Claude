"""One local-process voice relay with bounded queues, recording and finalization."""
import array
import base64
from collections import deque
import hashlib
import json
import math
import os
from pathlib import Path
import queue
import threading
import time
import wave
from django.conf import settings
from django.db import close_old_connections, transaction
from django.utils import timezone
from .live_budget import (APPROVAL, TestBudget, BudgetDenied, MAX_ACTIVE_SECONDS,
                          IDLE_SECONDS, CLIENT_GONE_SECONDS, VOICE_CENTS_PER_SECOND)
from .live_provider import (MODEL, VOICE, RATE, OpenAILiveTransport, ProviderFailure,
                            conversation_config, coaching_payload, request_coaching)
from .live_coaching import transcript_turns, local_policy_flags, build_feedback


def audio_directory(call_id):
    directory = Path(getattr(settings, 'LIVE_RECORDING_DIR', settings.DATA_DIR / 'live-recordings')) / str(call_id)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    return directory


class TimelineAudio:
    """Private mono WAV with silence padding on a local receipt timeline.

    These are separate input/output tracks, not proof of the exact audio heard
    by the trainee. Browser playback timestamps are retained separately.
    """
    def __init__(self, path):
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        self.file = os.fdopen(descriptor, 'wb')
        self.writer = wave.open(self.file, 'wb')
        self.writer.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        self.frames = 0

    def append(self, pcm, offset):
        if len(pcm) % 2 or len(pcm) > RATE * 4:
            raise ValueError('Invalid audio chunk.')
        target = min(round(max(0, offset) * RATE), 300 * RATE)
        if target > self.frames:
            self.writer.writeframes(b'\0\0' * (target - self.frames))
            self.frames = target
        if self.frames + len(pcm) // 2 > 300 * RATE:
            raise ValueError('Recording limit reached.')
        start = self.frames
        self.writer.writeframes(pcm)
        self.frames += len(pcm) // 2
        return start

    def close(self):
        self.writer.close()
        self.file.close()


class CallSession:
    def __init__(self, call_id, transport, config, directory, finish, *, clock=time.monotonic):
        self.call_id = str(call_id)
        self.transport = transport
        self.config = config
        self.directory = directory
        self.finish_callback = finish
        self.clock = clock
        self.started = self.last_activity = self.last_contact = clock()
        self.ready_at = None
        self.state = 'starting'
        self.error = ''
        self.stop_reason = ''
        self.stop_event = threading.Event()
        self.input_queue = queue.Queue(maxsize=24)
        self.lock = threading.RLock()
        self.events = deque(maxlen=2048)
        self.event_index = 0
        self.next_input_sequence = 0
        self.last_input_hash = None
        self.input_samples = 0
        self.fragments = []
        self.text_length = 0
        self.playback = []
        self.output_epoch = 0
        self.playback_held = False
        self.controls = []
        self.control_queue = queue.Queue(maxsize=24)
        self.last_output_signal = self.started
        self.input_segments = []
        self.output_segments = []
        self.capture_clock_used = False
        self.capture_missing = False
        self.last_capture_end = 0
        self.end_frame = None
        self.capture_complete = False
        self.review_missing = False
        self.browser_frames = 0
        self.usage_seconds = None
        self.confirmed = False
        self.delegations = set()
        self.metrics = {'first_customer_audio_ms': None, 'received_audio_chunks': 0, 'input_chunks': 0,
                        'local_input_speech_ms': [], 'output_received_ms': [], 'playback_errors': 0}
        self.thread = None

    def emit(self, kind, **values):
        with self.lock:
            self.event_index += 1
            self.events.append({'id': self.event_index, 'kind': kind, **values})
            return self.event_index

    def poll(self, after):
        with self.lock:
            self.last_contact = self.clock()
            if self.events and after < self.events[0]['id'] - 1:
                self.stop('client_evidence_gap')
                raise ValueError('Audio delivery was interrupted; the call is closing.')
            return {'state': self.state, 'events': [e for e in self.events if e['id'] > after][:120],
                    'error': self.error, 'confirmed': self.confirmed}

    def accept_audio(self, pcm, sequence, start_frame=None, review_pcm=None):
        if not pcm or len(pcm) % 2 or len(pcm) > 12288:
            raise ValueError('Invalid PCM chunk.')
        if start_frame is not None and (type(start_frame) is not int or not 0 <= start_frame <= 300 * RATE - len(pcm) // 2):
            raise ValueError('Invalid capture clock.')
        if review_pcm is not None and (start_frame is None or len(review_pcm) != len(pcm)):
            raise ValueError('Invalid conversation recording chunk.')
        checksum = hashlib.sha256(pcm + str(start_frame).encode() + (review_pcm or b'')).hexdigest()
        with self.lock:
            if sequence == self.next_input_sequence - 1 and checksum == self.last_input_hash:
                return  # Lost-ack retry is idempotent.
            if self.state != 'active' or self.stop_event.is_set():
                raise ValueError('The call is no longer accepting audio.')
            if sequence != self.next_input_sequence:
                raise ValueError('Audio order changed; stop and review the saved attempt.')
            elapsed = self.clock() - self.ready_at
            if self.input_samples + len(pcm) // 2 > (elapsed + 2) * RATE:
                raise ValueError('Input audio is arriving faster than real time.')
            try:
                if start_frame is not None and start_frame < self.last_capture_end:
                    raise ValueError('Capture clock moved backwards.')
                self.input_queue.put_nowait((pcm, start_frame, review_pcm))
            except queue.Full:
                self.stop('input_backpressure')
                raise ValueError('Audio queue is full; the call is closing.') from None
            if start_frame is not None:
                if start_frame != self.last_capture_end:
                    self.capture_missing = True
                self.capture_clock_used = True
                self.last_capture_end = start_frame + len(pcm) // 2
            else:
                self.capture_missing = True
            self.next_input_sequence += 1
            self.last_input_hash = checksum
            self.input_samples += len(pcm) // 2
            self.last_contact = self.clock()

    def note_playback(self, data):
        with self.lock:
            self.last_contact = self.clock()
            if len(self.playback) < 12000:
                self.playback.append(data)
            else:
                self.stop('playback_evidence_limit')
                raise ValueError('Playback evidence limit reached.')
            if data.get('error'):
                self.metrics['playback_errors'] += 1
                self.stop('playback_error')

    def control_playback(self, action, sequence, frame):
        if action not in {'interrupt', 'resume'} or type(sequence) is not int or type(frame) is not int or not 0 <= frame <= RATE*300:
            raise ValueError('Invalid playback control.')
        with self.lock:
            if 0 <= sequence < len(self.controls):
                previous = self.controls[sequence]
                if (previous['action'], previous['frame']) != (action, frame):
                    raise ValueError('Conflicting playback control.')
                return previous
            if sequence != len(self.controls) or sequence >= 24 or self.state != 'active' or self.stop_event.is_set():
                raise ValueError('Playback control is unavailable.')
            if (action == 'interrupt') == self.playback_held:
                raise ValueError('Playback state changed.')
            # Raw signal quiet is a recovery safeguard, never a completed-turn claim.
            if action == 'resume' and self.clock() - self.last_output_signal < .35:
                raise ValueError('Customer audio is still arriving. Keep playback held and try recovery again.')
            self.playback_held = action == 'interrupt'
            self.output_epoch += 1
            row = {'action':action, 'sequence':sequence, 'frame':frame, 'epoch':self.output_epoch}
            self.controls.append(row)
            self.control_queue.put_nowait(row)
            self.last_contact = self.clock()
            return row

    def relay_controls(self):
        while not self.control_queue.empty():
            row = self.control_queue.get_nowait()
            # Application-authored only. Never relay user text as instructions.
            content = ('The trainee is speaking. Stop your current sentence and listen. Stay in customer character.'
                       if row['action'] == 'interrupt' else
                       'The trainee has explicitly allowed customer playback again. Respond briefly to their latest point. Do not repeat the interrupted sentence or provide coaching.')
            self.transport.send({'type':'session.instructions.append', 'event_id':f"ll-playback-{row['sequence']}",
                                 'delegation_id':None, 'content':content})

    def note_end(self, frame, capture_complete=False):
        if type(capture_complete) is not bool or type(frame) is not int or not 0 <= frame <= 300 * RATE:
            raise ValueError('Invalid recording end time.')
        with self.lock:
            if self.end_frame is None:
                self.end_frame = frame
            elif self.end_frame != frame:
                raise ValueError('Recording end time changed.')
            self.capture_complete = self.capture_complete or capture_complete

    def stop(self, reason='user_stop'):

        self.stop_reason = self.stop_reason or reason
        self.stop_event.set()

    def launch(self):
        self.thread = threading.Thread(target=self.run, name='ll-live-call', daemon=True)
        self.thread.start()

    def handle(self, event, output):
        kind = event.get('type')
        now = self.clock()
        if kind == 'session.started':
            resolved = event.get('session', {})
            if resolved.get('model') != MODEL or resolved.get('store') is not False or resolved.get('delegation', {}).get('type') != 'client':
                self.error = 'unexpected_provider_configuration'
                self.stop('configuration_rejected')
                return
            self.ready_at = now
            self.last_activity = now
            self.state = 'active'
            self.emit('ready', model=MODEL, voice=VOICE)
            self.transport.send({'type': 'session.instructions.append', 'event_id': 'll-greeting',
                'delegation_id': None, 'content': 'Begin now in character with the configured customer opening, then pause and listen to the trainee.'})
        elif kind == 'session.output_audio.delta':
            pcm = base64.b64decode(event.get('delta', ''), validate=True)
            if len(pcm) % 2 or len(pcm) > RATE * 4:
                raise ValueError('Invalid provider audio.')
            offset = now - (self.ready_at or self.started)
            source_start = output.append(pcm, offset)
            self.last_activity = now
            self.metrics['received_audio_chunks'] += 1
            if self.metrics['first_customer_audio_ms'] is None:
                self.metrics['first_customer_audio_ms'] = round((now - self.started) * 1000)
            self.metrics['output_received_ms'].append(round(offset * 1000))
            with self.lock:
                samples = array.array('h', pcm)
                if samples and max(abs(v) for v in samples) > 300:
                    self.last_output_signal = now
                ident = self.emit('audio', pcm=base64.b64encode(pcm).decode(), received_ms=round(offset * 1000),
                                  epoch=self.output_epoch, suppressed=self.playback_held)
            if type(source_start) is int:
                self.output_segments.append({'event_id': ident, 'source_start': source_start, 'frames': len(pcm) // 2})
        elif kind in {'session.input_transcript.delta', 'session.output_transcript.delta'}:
            text = event.get('delta', '')
            start, end = event.get('start_ms'), event.get('end_ms')
            if not isinstance(text, str) or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (start, end)) or not 0 <= start <= end <= 310000:
                raise ValueError('Invalid transcript fragment.')
            if self.text_length + len(text) > 32000 or len(self.fragments) >= 2000:
                self.stop('transcript_limit')
                return
            fragment = {'id': 'fragment-' + str(len(self.fragments) + 1),
                'speaker': 'learner' if kind == 'session.input_transcript.delta' else 'customer',
                'text': text, 'start_ms': start, 'end_ms': end}
            self.fragments.append(fragment)
            self.text_length += len(text)
            self.emit('transcript', fragment=fragment)
        elif kind in {'session.usage.updated', 'session.closed'}:
            seconds = event.get('usage', {}).get('seconds')
            if not isinstance(seconds, (float, int)) or isinstance(seconds, bool) or not math.isfinite(seconds) or not 0 <= seconds <= 300:
                raise ValueError('Invalid voice usage.')
            if self.usage_seconds is not None and seconds < self.usage_seconds:
                raise ValueError('Non-monotonic voice usage.')
            self.usage_seconds = seconds
            if kind == 'session.closed':
                self.confirmed = True
                self.state = 'finalizing'
                self.stop_reason = self.stop_reason or 'provider_closed'
        elif kind == 'session.delegation.created':
            delegation = event.get('delegation', {})
            ident = delegation.get('id')
            if delegation.get('target') != 'client' or not isinstance(ident, str) or len(ident) > 200:
                raise ValueError('Unexpected paid delegation.')
            if ident not in self.delegations:
                if len(self.delegations) >= 12:
                    self.stop('delegation_limit')
                    return
                self.delegations.add(ident)
                self.transport.send({'type': 'session.thinking.append', 'event_id': 'll-policy-' + str(len(self.delegations)),
                    'delegation_id': ident, 'content': 'Use only the fictional customer and company truth in the initial configuration. Unconfirmed policy, availability and service fit require manager clarification. Only the configured commitment may be agreed; never a confirmed booking or payment. Stay in customer character. No operational action or provider delegation was performed.'})
        elif kind in {'error', 'response.event'}:
            # Do not copy provider messages/headers/errors into logs or browser.
            self.error = 'provider_rejected_request' if kind == 'error' else 'unexpected_paid_backend'
            self.stop(self.error)

    def record_input(self, incoming, browser, item):
        pcm, capture_frame, review_pcm = item
        source_start = incoming.append(pcm, incoming.frames / RATE)
        if capture_frame is not None:
            self.input_segments.append({'source_start':source_start,'frames':len(pcm)//2,'timeline_start':capture_frame})
        if review_pcm is not None and capture_frame is not None:
            browser.append(review_pcm, capture_frame / RATE)
            self.browser_frames = browser.frames
        else:
            self.review_missing = True
        return pcm

    def run(self):
        recordings = []
        close_requested = None
        try:
            incoming = TimelineAudio(self.directory / 'learner.wav')
            recordings.append(incoming)
            outgoing = TimelineAudio(self.directory / 'customer.wav')
            recordings.append(outgoing)
            browser = TimelineAudio(self.directory / 'browser-conversation.wav')
            recordings.append(browser)
            self.transport.open(self.config)
            while True:
                now = self.clock()
                if self.ready_at is None and now - self.started >= 15:
                    self.stop('startup_timeout')
                if now - self.started >= MAX_ACTIVE_SECONDS:
                    self.stop('session_limit')
                if self.ready_at and now - self.last_contact >= CLIENT_GONE_SECONDS:
                    self.stop('browser_disconnected')
                if self.ready_at and now - self.last_activity >= IDLE_SECONDS:
                    self.stop('idle_timeout')
                if self.stop_event.is_set() and close_requested is None:
                    self.state = 'closing'
                    self.emit('closing', reason=self.stop_reason)
                    self.transport.send({'type': 'session.close', 'event_id': 'll-close'})
                    close_requested = now
                if close_requested is not None and now - close_requested >= 15:
                    self.error = self.error or 'finalization_unconfirmed'
                    break
                if self.ready_at and close_requested is None:
                    self.relay_controls()
                    for _ in range(8):
                        try:
                            item = self.input_queue.get_nowait()
                        except queue.Empty:
                            break
                        pcm = self.record_input(incoming, browser, item)
                        self.metrics['input_chunks'] += 1
                        samples = array.array('h', pcm)
                        if samples and sum(abs(x) for x in samples) / len(samples) > 300:
                            self.last_activity = now
                            if len(self.metrics['local_input_speech_ms']) < 3000:
                                self.metrics['local_input_speech_ms'].append(round((now - self.ready_at) * 1000))
                        self.transport.send({'type': 'session.input_audio.append', 'audio': base64.b64encode(pcm).decode()})
                event = self.transport.receive(timeout=.04)
                if event:
                    self.handle(event, outgoing)
                if self.confirmed:
                    break
        except Exception:
            self.error = self.error or 'connection_or_storage_failure'
        finally:
            self.transport.close()
            # Preserve accepted local capture even if stop precedes the next relay
            # iteration. These final chunks are never sent after provider closure.
            if len(recordings) == 3:
                try:
                    while not self.input_queue.empty():
                        self.record_input(incoming, browser, self.input_queue.get_nowait())
                        self.metrics['unsent_input_chunks'] = self.metrics.get('unsent_input_chunks',0) + 1
                except Exception:
                    self.review_missing = True
            for recording in recordings:
                try:
                    recording.close()
                except Exception:
                    self.error = self.error or 'recording_storage_failure'
            result = {'fragments': self.fragments, 'usage_seconds': self.usage_seconds,
                'confirmed': self.confirmed, 'error_code': self.error, 'stop_reason': self.stop_reason,
                'metrics': self.metrics, 'playback': self.playback, 'playback_controls':self.controls,
                'local_elapsed_seconds': round(self.clock() - self.started, 3),
                'audio_tracks': [p.name for p in self.directory.glob('*.wav')],
                'audio_timing_note': 'Learner track uses captured frame order; customer track uses local receipt time. Playback records are separate. Not an audio-cadence measurement.'}
            if self.browser_frames:
                result['browser_recording'] = {'version':2,'rate':RATE,'frames':self.browser_frames,
                    'end_frame':self.end_frame,
                    'complete':self.capture_complete and not self.review_missing and not self.capture_missing
                               and self.end_frame == self.last_capture_end == self.browser_frames,
                    'source':'microphone input and rendered customer output on the same browser AudioWorklet',
                    'gain_per_speaker':.5,'hardware_latency_measured':False}
            if self.capture_clock_used:
                result['audio_timeline'] = {'version': 1, 'rate': RATE,
                    'input_segments': self.input_segments, 'output_segments': self.output_segments,
                    'capture_missing': self.capture_missing, 'end_frame': self.end_frame}
                result['audio_timing_note'] = ('Shared browser capture/render and scheduled playback frame clock; '
                    'original WAVs retain capture/receipt layout. Device latency is not measured; '
                    'browser render audio is saved separately, with capture completion recorded. No cadence scoring.')
            self.state = 'finalizing'
            try:
                self.finish_callback(self.call_id, result)
                self.state = 'closed' if self.confirmed and not self.error else 'failed'
            except Exception:
                self.error = 'local_finalization_failure'
                self.state = 'failed'
            self.emit('finished', state=self.state, error=self.error)


class LiveController:
    def __init__(self):
        self.lock = threading.RLock()
        self.secret = None
        self.budget = None
        self.sessions = {}
        self.armed = False
        self.input_mode = 'synthetic'
        self.assignment_id = None
        self.scenario_choices = ()

    def arm(self, secret, budget, *, assignment_id=None, scenario_choices=()):
        if budget.input_mode == 'microphone' and (not isinstance(assignment_id, int) or assignment_id < 1):
            raise BudgetDenied('Microphone acceptance requires its own assigned test.')
        if hasattr(budget, 'validate_binding'):
            budget.validate_binding(assignment_id,scenario_choices)
        budget.arm()
        self.secret, self.budget, self.armed = secret, budget, True
        self.input_mode, self.assignment_id = budget.input_mode, assignment_id
        self.scenario_choices = tuple(scenario_choices)

    def start(self, call):
        with self.lock:
            if not self.armed or self.secret is None:
                raise BudgetDenied('Live testing is disabled. The owner must launch the specifically approved test.')
            if (call.attempt.scenario.get('input_mode', 'synthetic') != self.input_mode or
                    (self.assignment_id is not None and call.attempt.assignment_id != self.assignment_id) or
                    call.approval != self.budget.approval):
                raise BudgetDenied('This call does not match the explicitly authorized test mode and assignment.')
            if any(s.state not in {'closed', 'failed'} for s in self.sessions.values()):
                raise BudgetDenied('Another call is active or finalizing.')
            from .live_preparation import selection_allowed
            if not selection_allowed(self, call.attempt.scenario):
                raise BudgetDenied('This caller and difficulty are outside the authorization scope.')
            if hasattr(self.budget, 'validate_call'):
                self.budget.validate_call(call)
            ident = str(call.pk)
            self.budget.reserve(ident)
            session = CallSession(ident, OpenAILiveTransport(self.secret),
                conversation_config(call.attempt.policy, call.attempt.scenario),
                audio_directory(ident), self.finalize)
            self.sessions[ident] = session
            session.launch()
            return session

    def finalize(self, ident, result):
        from .models import Attempt, LiveCall, UsageEntry
        close_old_connections()
        confirmed = result['confirmed']
        report, grading_usage = None, None
        grading_ok = True
        try:
            if confirmed:
                self.budget.voice_closed(ident, result['usage_seconds'])
            else:
                self.budget.finish(ident, confirmed=False)
                self.armed = False
            attempt = Attempt.objects.get(pk=ident)
            # Actual saved CRM events remain authoritative; model words do not
            # fabricate practice actions, approvals, deposits or bookings.
            attempt.transcript = transcript_turns(result['fragments']) + [
                t for t in attempt.transcript if t.get('speaker') == 'Practice CRM']
            attempt.actions.extend(local_policy_flags(attempt))
            if confirmed and not result['error_code'] and any(t['speaker'] == 'Learner' for t in attempt.transcript):
                try:
                    payload = coaching_payload(attempt)
                    self.budget.authorize_grading(ident)
                    report, grading_usage = request_coaching(self.secret, payload)
                except Exception:
                    grading_ok = False
                    result['coaching_error'] = 'provider_coaching_unconfirmed'
            with transaction.atomic():
                # A notes request may have entered before the call began closing.
                # Re-read after provider coaching, under the write lock, so saved
                # CRM evidence and feedback cannot be replaced by an older copy.
                attempt = Attempt.objects.select_for_update().get(pk=ident)
                attempt.transcript = transcript_turns(result['fragments']) + [
                    t for t in attempt.transcript if t.get('speaker') == 'Practice CRM']
                existing_flags={(e.get('code'),e.get('evidence'),e.get('source')) for e in attempt.actions}
                attempt.actions.extend(e for e in local_policy_flags(attempt)
                    if (e.get('code'),e.get('evidence'),e.get('source')) not in existing_flags)
                attempt.feedback = build_feedback(attempt, report)
                attempt.feedback['provider_coaching'] = 'received' if report else 'unavailable — manager review'
                # Retain a safe local journal even if the DB save fails. It contains
                # only fictional evidence and explicitly filtered usage/metrics.
                path = audio_directory(ident) / 'evidence.json'
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                with os.fdopen(fd, 'w') as stream:
                    json.dump({'attempt': ident, **result, 'feedback': attempt.feedback, 'grading_usage': grading_usage}, stream)
                Attempt.objects.filter(pk=ident, status='active').update(transcript=attempt.transcript,
                    actions=attempt.actions, feedback=attempt.feedback, status='submitted', submitted_at=timezone.now(),
                    revision=attempt.revision + 1)
                LiveCall.objects.filter(pk=ident).update(state='closed' if confirmed and not result['error_code'] else 'failed',
                    closed_at=timezone.now(), fragments=result['fragments'],
                    evidence={k: v for k, v in result.items() if k not in {'fragments', 'usage_seconds'}},
                    usage={'voice_seconds': result['usage_seconds'], 'final_confirmed': confirmed,
                           'grading': grading_usage, 'provider_reported_cost': None}, error_code=result['error_code'])
                from decimal import Decimal
                estimate = Decimal(str(result['usage_seconds'] or result['local_elapsed_seconds'])) * VOICE_CENTS_PER_SECOND
                UsageEntry.objects.get_or_create(event_key='live-voice:' + ident, defaults={
                    'attempt': attempt, 'user': attempt.assignment.learner, 'provider': 'openai', 'model': MODEL,
                    'activity': 'live_voice', 'synthetic': False, 'voice_seconds': result['usage_seconds'] or 0,
                    'estimated_cents': estimate, 'reported_cents': None, 'price_version': 'openai-public-2026-10-07'})
                if grading_usage:
                    UsageEntry.objects.get_or_create(event_key='live-coaching:' + ident, defaults={
                        'attempt': attempt, 'user': attempt.assignment.learner, 'provider': 'openai',
                        'model': grading_usage['model'], 'activity': 'transcript_coaching', 'synthetic': False,
                        'input_tokens': grading_usage['input_tokens'], 'output_tokens': grading_usage['output_tokens'],
                        'estimated_cents': grading_usage['estimated_cents'], 'reported_cents': None,
                        'price_version': grading_usage['price_version']})
            self.budget.finish(ident, confirmed=confirmed and grading_ok and not result['error_code'],
                               grading_cents=grading_usage['estimated_cents'] if grading_usage else None)
            if not grading_ok or result['error_code']:
                self.armed = False
            if self.budget.close_after_call:
                self.armed = False
                self.budget.close()
                self.secret = None
                # The call is finalized; polling saved events needs no credential.
                for session in self.sessions.values():
                    session.transport.secret = None
                    session.transport.socket = None
        except Exception:
            self.armed = False
            self.budget.finish(ident, confirmed=False)
            raise
        finally:
            close_old_connections()

    def disable(self):
        self.armed = False
        for session in self.sessions.values():
            session.stop('owner_test_shutdown')
        for session in self.sessions.values():
            if session.thread:
                session.thread.join(timeout=38)
        if self.budget:
            self.budget.close()
        self.secret = None


controller = LiveController()
