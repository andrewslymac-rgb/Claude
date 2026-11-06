"""Reject silent or incomplete synthetic speech before a paid connection."""
import array
import sys
import wave

RATE = 24000
DURATION = 112
STARTS = (5, 20, 33, 52, 73, 93)


def speech_stats(pcm):
    if len(pcm) % 2:
        raise ValueError('Invalid fictional PCM data.')
    samples = array.array('h', pcm)
    if sys.byteorder != 'little':
        samples.byteswap()
    peak = max((abs(value) for value in samples), default=0)
    active = sum(abs(value) > 256 for value in samples)
    if active < RATE // 10:
        raise ValueError('Fictional speech is silent or too short. No paid call may start.')
    return {'peak': peak, 'active_samples': active}


def validate_fixture(path):
    with wave.open(str(path), 'rb') as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getnframes()) != (1, 2, RATE, RATE * DURATION):
            raise ValueError('Unexpected fictional fixture format or duration.')
        pcm = audio.readframes(audio.getnframes())
    # Every planned phrase must contain audio, not merely one nonzero sample.
    phrases = [speech_stats(pcm[start * RATE * 2:end * RATE * 2])
               for start, end in zip(STARTS, (*STARTS[1:], DURATION))]
    return {'duration': DURATION, 'phrases': phrases}
