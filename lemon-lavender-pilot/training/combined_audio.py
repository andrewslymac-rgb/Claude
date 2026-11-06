"""Local derived review audio. Never rewrites source recordings or calls a provider."""
import array
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import sys
import tempfile
import wave

RATE = 24000
LIMIT = 300 * RATE
VERSION = 2


class MixUnavailable(ValueError):
    pass


def private_read(path, limit=32_000_000):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise MixUnavailable('Invalid recording file.')
        return stream.read()


def read_track(path):
    import io
    raw = private_read(path)
    with wave.open(io.BytesIO(raw), 'rb') as audio:
        rate, count = audio.getframerate(), audio.getnframes()
        if (audio.getnchannels() != 1 or audio.getsampwidth() != 2 or
                audio.getcomptype() != 'NONE' or not 8000 <= rate <= 48000 or count > rate * 300):
            raise MixUnavailable('Unsupported recording format.')
        pcm = audio.readframes(count)
        if len(pcm) != count * 2:
            raise MixUnavailable('Incomplete recording.')
    samples = array.array('h', pcm)
    if sys.byteorder != 'little':
        samples.byteswap()
    return samples, rate, hashlib.sha256(raw).hexdigest()


def integer(value, maximum=LIMIT):
    if type(value) is not int or not 0 <= value <= maximum:
        raise MixUnavailable('Invalid recording timeline.')
    return value


def placements(tracks, evidence):
    """All destinations are on the browser's shared 24 kHz frame clock.

    Old recordings without that clock are available only as separate originals;
    transcripts and file origins are never used to invent alignment.
    """
    timeline = evidence.get('audio_timeline')
    if not timeline:
        raise MixUnavailable('This recording has no shared timing. Use the original speaker tracks.')
    if timeline.get('version') != 1 or timeline.get('rate') != RATE or timeline.get('capture_missing'):
        raise MixUnavailable('Shared recording timeline is incomplete.')
    end = timeline.get('end_frame')
    if end is not None:
        end = integer(end)
    result = {'learner': [], 'customer': []}
    cursor = 0
    previous_end = 0
    for segment in timeline.get('input_segments', []):
        start = integer(segment['source_start']); count = integer(segment['frames'])
        at = integer(segment['timeline_start'])
        if start != cursor or at < previous_end or at + count > LIMIT:
            raise MixUnavailable('Input timeline overlaps or has missing samples.')
        result['learner'].append((start, count, at))
        cursor += count; previous_end = at + count
    if cursor != len(tracks['learner'][0]) or tracks['learner'][1] != RATE:
        raise MixUnavailable('Input timeline does not cover the recording.')
    reports = {}
    for row in evidence.get('playback', []):
        if 'scheduled_frame' not in row:
            continue
        ident = integer(row['audio_event_id'], 100000)
        if ident in reports and reports[ident] != row:
            raise MixUnavailable('Conflicting playback evidence.')
        reports[ident] = row
    seen = set(); previous_source_end = 0; previous_playback_end = 0; unscheduled = 0
    for segment in timeline.get('output_segments', []):
        ident = integer(segment['event_id'], 100000)
        start = integer(segment['source_start']); count = integer(segment['frames'])
        if ident in seen or start < previous_source_end or start + count > len(tracks['customer'][0]):
            raise MixUnavailable('Invalid customer source map.')
        seen.add(ident); previous_source_end = start + count
        row = reports.get(ident)
        if row is None:
            unscheduled += 1
            continue  # Received but never acknowledged as scheduled: don't invent playback.
        at = integer(row['scheduled_frame'])
        if integer(row['frames']) != count or at < previous_playback_end or at + count > LIMIT:
            raise MixUnavailable('Invalid customer playback map.')
        previous_playback_end = at + count
        result['customer'].append((start, count, at))
    if tracks['customer'][1] != RATE or set(reports) - seen or previous_source_end != len(tracks['customer'][0]):
        raise MixUnavailable('Customer timeline does not cover the recording.')
    quality = 'shared_clock' if end is not None and not unscheduled else 'shared_clock_partial'
    return result, quality, end, unscheduled


def mix_pcm(tracks, mapping, end=None):
    duration = 0
    for name, segments in mapping.items():
        samples, rate, _ = tracks[name]
        previous_end = 0
        for start, count, at in segments:
            integer(start, len(samples)); integer(count, len(samples)); integer(at)
            if start + count > len(samples) or at < previous_end:
                raise MixUnavailable('Invalid sample placement.')
            previous_end = at + math.ceil(count * RATE / rate)
            duration = max(duration, previous_end)
    if duration > LIMIT:
        raise MixUnavailable('Recording exceeds the session limit.')
    # An explicit stop time trims queued customer audio and retains trailing silence.
    if end is not None:
        duration = integer(end)
    mixed = array.array('i', [0]) * duration
    for name, segments in mapping.items():
        samples, rate, _ = tracks[name]
        for start, count, at in segments:
            length = min(math.ceil(count * RATE / rate), max(0, duration - at))
            for offset in range(length):
                if rate == RATE:
                    value = samples[start + offset]
                else:
                    position = offset * rate / RATE
                    lower = int(position); fraction = position - lower
                    left = samples[start + lower]
                    right = samples[start + min(lower + 1, count - 1)]
                    value = round(left + (right - left) * fraction)
                mixed[at + offset] += value
    # Two mono speakers, each at half amplitude: overlaps cannot digitally clip.
    output = array.array('h', (round(value / 2) for value in mixed))
    if sys.byteorder != 'little':
        output.byteswap()
    return output.tobytes(), duration


def atomic_private(path, write):
    fd, temporary = tempfile.mkstemp(prefix='.combined-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            write(stream)
            stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def ensure_combined(directory, evidence):
    """Idempotent, private derived file + provenance. Originals remain immutable."""
    directory = Path(directory)
    if evidence.get('browser_recording'):
        return browser_recording(directory,evidence)
    if not evidence.get('audio_timeline'):
        raise MixUnavailable('No reliable shared timeline; use the original recordings.')
    lock = os.open(directory / '.combined.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock, 'a+b') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        tracks = {name: read_track(directory / (name + '.wav')) for name in ('learner', 'customer')}
        sources = {name: data[2] for name, data in tracks.items()}
        timing_hash = hashlib.sha256(json.dumps({k: evidence.get(k) for k in ('audio_timeline', 'playback')}, sort_keys=True).encode()).hexdigest()
        destination, manifest = directory / 'combined.wav', directory / 'combined.json'
        try:
            previous = json.loads(private_read(manifest, 10000))
            if (previous['version'] == VERSION and previous['sources'] == sources and
                    previous['timing_sha256'] == timing_hash and
                    hashlib.sha256(private_read(destination)).hexdigest() == previous['sha256']):
                return previous
        except (OSError, ValueError, KeyError):
            pass
        mapping, quality, end, unscheduled = placements(tracks, evidence)
        pcm, frames = mix_pcm(tracks, mapping, end)
        if not frames:
            raise MixUnavailable('No recorded audio is available.')
        def write_wav(stream):
            with wave.open(stream, 'wb') as audio:
                audio.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
                audio.writeframes(pcm)
        atomic_private(destination, write_wav)
        report = {'version': VERSION, 'sources': sources, 'timing_sha256': timing_hash,
                  'sha256': hashlib.sha256(private_read(destination)).hexdigest(),
                  'quality': quality, 'seconds': frames / RATE, 'sample_rate': RATE,
                  'gain_per_speaker': .5, 'unscheduled_customer_chunks': unscheduled,
                  'method': 'Browser capture/render and scheduled playback frame clock' if quality != 'approximate' else 'Original file origins; shared capture/playback timing unavailable',
                  'limitation': 'Browser scheduling is not proof of sound reaching the listener; hardware latency and microphone echo are not corrected.'}
        atomic_private(manifest, lambda output: output.write((json.dumps(report, indent=2) + '\n').encode()))
        return report


def combined_status(directory, evidence):
    try:
        return ensure_combined(directory, evidence)
    except (OSError, ValueError, KeyError, TypeError, wave.Error):
        return None


def browser_recording(directory,evidence):
    """Use the actual render capture, never rebuild it from receipt timestamps."""
    metadata=evidence['browser_recording']
    if metadata.get('version') not in {1,2} or metadata.get('rate')!=RATE or not metadata.get('complete'):
        raise MixUnavailable('Browser recording is incomplete; use original tracks.')
    samples,rate,digest=read_track(directory/'browser-conversation.wav')
    if rate!=RATE or not samples or type(metadata.get('frames')) is not int or metadata['frames']!=len(samples):
        raise MixUnavailable('Invalid browser recording.')
    if metadata.get('version') == 2 and (metadata.get('end_frame') != len(samples) or evidence.get('audio_timeline',{}).get('capture_missing')):
        raise MixUnavailable('Incomplete browser render timeline.')
    return {'version':VERSION,'quality':'browser_render','seconds':len(samples)/rate,
            'sha256':digest,'filename':'browser-conversation.wav','gain_per_speaker':.5,
            'method':'Recorded microphone input and rendered customer output, including actual playback stops',
            'limitation':'Hardware latency and microphone echo are not corrected.'}
