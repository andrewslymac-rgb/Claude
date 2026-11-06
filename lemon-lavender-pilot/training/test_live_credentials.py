"""In-memory native-bridge doubles only: never reads any real Keychain item."""
import ctypes as c
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch
from . import live_credentials as reader


class NativeDouble:
    def __init__(self, payload, *, status=0):
        self.buffer = c.create_string_buffer(payload)
        self.payload = payload
        self.interaction = []
        def previous(out):
            c.cast(out, c.POINTER(c.c_bool))[0] = True
            return 0
        def interaction(allowed):
            self.interaction.append(allowed)
            return 0
        def opened(path, out):
            c.cast(out, c.POINTER(c.c_void_p))[0] = c.c_void_p(123)
            return 0
        def found(ref, service_length, service, account_length, account, length, data, item):
            if status: return status
            c.cast(length, c.POINTER(c.c_uint32))[0] = len(payload)
            c.cast(data, c.POINTER(c.c_void_p))[0] = c.cast(self.buffer, c.c_void_p)
            return 0
        self.security = SimpleNamespace(
            SecKeychainGetUserInteractionAllowed=Mock(side_effect=previous),
            SecKeychainSetUserInteractionAllowed=Mock(side_effect=interaction),
            SecKeychainOpen=Mock(side_effect=opened),
            SecKeychainFindGenericPassword=Mock(side_effect=found),
            SecKeychainItemFreeContent=Mock(return_value=0))
        self.foundation = SimpleNamespace(CFRelease=Mock())

    def read(self, **kwargs):
        with patch.object(reader, 'login_keychain', return_value=Path('/dummy/login.keychain-db')), \
             patch.object(reader.c, 'CDLL', side_effect=[self.security, self.foundation]), \
             patch.object(reader.c.util, 'find_library', side_effect=['dummy-security', 'dummy-foundation']):
            return reader.read_project_key(**kwargs)


class NativeReaderTests(TestCase):
    def test_project_prefix_and_long_dummy_keys_survive_bridge_exactly(self):
        for size in (20, 51, 128, 164, 200, 512, 1024, 1200, 4096, 8192):
            value = b'sk-proj-' + b'Ab3_-' * ((size - 8) // 5) + b'x' * ((size - 8) % 5)
            self.assertEqual(len(value), size)
            native = NativeDouble(value)
            secret = native.read()
            self.assertEqual(secret.authorization(), 'Bearer ' + value.decode('ascii'))
            self.assertEqual(native.interaction, [False, True])
            native.security.SecKeychainItemFreeContent.assert_called_once()
            native.foundation.CFRelease.assert_called_once()

    def test_legacy_and_service_account_prefixes_already_work(self):
        for prefix in (b'sk-', b'sk-proj-', b'sk-svcacct-'):
            value = prefix + b'x' * 100
            self.assertEqual(NativeDouble(value).read().authorization(), 'Bearer ' + value.decode())

    def test_terminal_cr_lf_spaces_quotes_and_non_ascii_are_not_silently_repaired(self):
        good = b'sk-proj-' + b'x' * 156
        invalid = [good + b'\n', good + b'\r\n', b' ' + good, good + b' ',
                   b'"' + good + b'"', b'\xef\xbb\xbf' + good, b'\x1b[200~' + good + b'\x1b[201~',
                   good[:25] + b'\n' + good[25:]]
        for value in invalid:
            native = NativeDouble(value)
            with self.assertRaises(reader.CredentialUnavailable) as error:
                native.read()
            self.assertNotIn('x' * 30, str(error.exception))
            native.security.SecKeychainItemFreeContent.assert_called_once()
            native.foundation.CFRelease.assert_called_once()
            self.assertEqual(native.interaction[-1], True)

    def test_exact_returned_length_does_not_copy_native_terminator(self):
        native = NativeDouble(b'sk-proj-' + b'x' * 156)
        self.assertEqual(len(native.read().authorization()), 171)
        self.assertNotIn('\0', native.read().authorization())

    def test_local_length_bounds_are_explicit(self):
        for value in (b'', b'sk-short', b'sk-proj-' + b'x' * 8185):
            with self.assertRaises(reader.CredentialUnavailable): NativeDouble(value).read()

    def test_no_format_check_when_native_access_is_denied(self):
        native = NativeDouble(b'', status=-25293)
        with self.assertRaises(reader.CredentialUnavailable) as error: native.read()
        self.assertIn('macos_authorization_denied', str(error.exception))
        native.security.SecKeychainItemFreeContent.assert_not_called()

    def test_cleanup_failure_is_not_misreported_as_bad_key(self):
        native = NativeDouble(b'sk-proj-' + b'x' * 156)
        native.security.SecKeychainItemFreeContent.side_effect = RuntimeError('dummy cleanup failure')
        with self.assertRaises(reader.CredentialUnavailable) as error: native.read()
        self.assertIn('native_cleanup_failed', str(error.exception))
        self.assertNotIn('dummy cleanup failure', str(error.exception))

    def test_embedded_nul_and_ascii_control_cannot_reach_authorization(self):
        for value in (0, 1, 27, 127):
            with self.assertRaises(reader.CredentialUnavailable):
                NativeDouble(b'sk-proj-' + b'x' * 32 + bytes([value])).read()
