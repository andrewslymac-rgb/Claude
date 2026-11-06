"""Create fictional trainee PCM offline with an already-installed Mac voice."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import wave
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from training.live_fixture import speech_stats, validate_fixture

LINES = [
    (5, 'Thanks for calling Lemon and Lavender. I am Alex. What cleaning priorities do you have, and about how many square feet is your home?'),
    (20, 'Thank you. Are you looking for every other week, and when would you ideally like to start?'),
    (33, 'For your two thousand square foot home, the required initial deep clean is five hundred seventy dollars. Biweekly cleaning after that is two hundred twenty dollars per visit.'),
    (52, 'The initial deep gives us the time to address that kitchen buildup and bathroom detail first. Then recurring visits maintain that starting point. The initial deep is required for recurring service.'),
    (73, 'Would you like me to send a service request for the initial deep and biweekly plan, with next week as your preferred timing? The team still needs to confirm availability.'),
    (93, 'I have saved your kitchen and bathroom priorities and those estimates in the practice notes. This is a service request, not a confirmed booking. The team will follow up about availability. Thank you.'),
]


class Command(BaseCommand):
    help = 'Create an offline fictional trainee fixture; no microphone or provider call.'

    def handle(self, *args, **options):
        target = settings.DATA_DIR / 'live-test-fixture.wav'
        if target.exists():
            try:
                validate_fixture(target)
            except (ValueError, wave.Error, OSError) as exc:
                raise CommandError(str(exc)) from None
            self.stdout.write('Existing fictional fixture retained.'); return
        installed = subprocess.run(['/usr/bin/say', '-v', '?'], capture_output=True, text=True, check=True).stdout
        if 'Daniel' not in installed:
            raise CommandError('Daniel is not installed. No voice download will be attempted.')
        frames = bytearray(112 * 24000 * 2)
        with tempfile.TemporaryDirectory(prefix='ll-fictional-speech-') as directory:
            for index, (seconds, text) in enumerate(LINES):
                piece = Path(directory) / (str(index) + '.wav')
                result = subprocess.run(['/usr/bin/say', '-v', 'Daniel', '-r', '175', '-o', str(piece),
                    '--file-format=WAVE', '--data-format=LEI16@24000', text], capture_output=True, timeout=30)
                if result.returncode:
                    raise CommandError('Offline speech rendering failed.')
                with wave.open(str(piece), 'rb') as audio:
                    if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 24000):
                        raise CommandError('Unexpected fictional audio format.')
                    pcm = audio.readframes(audio.getnframes())
                try:
                    speech_stats(pcm)
                except ValueError as exc:
                    raise CommandError(str(exc)) from None
                offset = seconds * 24000 * 2
                if offset + len(pcm) > len(frames):
                    raise CommandError('Fictional phrase exceeds fixture duration.')
                frames[offset:offset + len(pcm)] = pcm
        fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, 'wb') as stream, wave.open(stream, 'wb') as audio:
            audio.setparams((1, 2, 24000, 0, 'NONE', 'not compressed')); audio.writeframes(frames)
        validate_fixture(target)
        self.stdout.write('Created 112-second fictional trainee fixture using installed Daniel voice. No external service used.')
