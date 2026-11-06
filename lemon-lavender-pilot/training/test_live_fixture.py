import struct
import tempfile
import wave
from pathlib import Path
from unittest.mock import patch
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings
from .live_fixture import RATE, DURATION, STARTS, validate_fixture, speech_stats


class FictionalSpeechTests(SimpleTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.path = self.root / 'live-test-fixture.wav'

    def fixture(self, starts=()):
        pcm = bytearray(RATE * DURATION * 2)
        for start in starts:
            position = start * RATE * 2
            pcm[position:position + 6000] = struct.pack('<h', 1200) * 3000
        with wave.open(str(self.path), 'wb') as audio:
            audio.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            audio.writeframes(pcm)

    def test_silent_existing_file_is_rejected_before_keychain_or_arm(self):
        self.fixture()
        with override_settings(DATA_DIR=self.root, DATABASES={'default': {'NAME': self.root / 'pilot.sqlite3'}}):
            with patch('training.management.commands.serve_live_test.read_project_key') as key:
                with patch('training.management.commands.serve_live_test.controller') as controller:
                    with self.assertRaisesMessage(CommandError, 'silent'):
                        call_command('serve_live_test')
                    key.assert_not_called()
                    controller.arm.assert_not_called()

    def test_existing_silent_fixture_is_not_mistaken_for_success(self):
        self.fixture()
        with override_settings(DATA_DIR=self.root):
            with self.assertRaisesMessage(CommandError, 'silent'):
                call_command('build_live_fixture')

    def test_each_phrase_must_be_audible(self):
        self.fixture(STARTS[:-1])
        with self.assertRaises(ValueError): validate_fixture(self.path)
        self.fixture(STARTS)
        self.assertEqual(len(validate_fixture(self.path)['phrases']), 6)

    def test_short_click_or_tiny_noise_is_not_speech(self):
        for pcm in (b'\0\0' * RATE, struct.pack('<h', 32767), struct.pack('<h', 1) * RATE):
            with self.assertRaises(ValueError): speech_stats(pcm)

    def test_bad_duration_is_rejected(self):
        with wave.open(str(self.path), 'wb') as audio:
            audio.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            audio.writeframes(struct.pack('<h', 1200) * RATE)
        with self.assertRaisesMessage(ValueError, 'duration'): validate_fixture(self.path)
