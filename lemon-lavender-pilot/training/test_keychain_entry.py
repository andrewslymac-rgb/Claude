"""Dummy input and native doubles; never accesses the actual Keychain."""
import ctypes as c
from contextlib import ExitStack, redirect_stderr
import getpass
import io
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch
from . import keychain_entry as entry

DUMMY = 'sk-proj-' + 'D' * 156


class EntryTests(TestCase):
    def setUp(self):
        self.context = ExitStack(); self.addCleanup(self.context.close)
        self.context.enter_context(patch.object(entry.setup, 'login_keychain', return_value=Path('/dummy/login.keychain-db')))
        self.present = self.context.enter_context(patch.object(entry.setup, 'credential_present', return_value=False))
        self.write = self.context.enter_context(patch.object(entry, 'native_store'))
        self.streams = {name: Mock() for name in ('stdin', 'stdout', 'stderr')}
        for stream in self.streams.values(): stream.isatty.return_value = True

    def test_full_length_value_sent_only_to_native_memory_writer(self):
        entry.enter('create', hidden=Mock(side_effect=[DUMMY, DUMMY]), **self.streams)
        self.write.assert_called_once_with(DUMMY.encode(), Path('/dummy/login.keychain-db'), replace=False)
        for stream in self.streams.values():
            self.assertNotIn(DUMMY, str(stream.mock_calls))

    def test_create_refuses_existing_item_before_entry(self):
        self.present.return_value = True; hidden = Mock()
        with self.assertRaises(entry.EntryError): entry.enter('create', hidden=hidden, **self.streams)
        hidden.assert_not_called(); self.write.assert_not_called()

    def test_replacement_requires_exact_human_confirmation_before_hidden_entry(self):
        self.present.return_value = True; hidden = Mock()
        for answer in ('', 'yes', 'replace training key'):
            with self.assertRaises(entry.EntryError):
                entry.enter('replace', confirm=Mock(return_value=answer), hidden=hidden, **self.streams)
        hidden.assert_not_called(); self.write.assert_not_called()

    def test_approved_replacement_scoped_to_existing_item(self):
        self.present.return_value = True
        entry.enter('replace', confirm=Mock(return_value='REPLACE TRAINING KEY'),
            hidden=Mock(side_effect=[DUMMY, DUMMY]), **self.streams)
        self.write.assert_called_once_with(DUMMY.encode(), Path('/dummy/login.keychain-db'), replace=True)

    def test_mismatch_malformed_cancel_or_insecure_terminal_cannot_write(self):
        for answers in ([DUMMY, DUMMY + 'x'], [DUMMY + '\n'], [DUMMY + '\x00']):
            with self.assertRaises((entry.EntryError, entry.CredentialUnavailable)):
                entry.enter('create', hidden=Mock(side_effect=answers), **self.streams)
        for failure in (KeyboardInterrupt, EOFError, getpass.GetPassWarning):
            with self.assertRaises(failure):
                entry.enter('create', hidden=Mock(side_effect=failure), **self.streams)
        self.streams['stdin'].isatty.return_value = False
        with self.assertRaises(entry.EntryError): entry.enter('create', **self.streams)
        self.write.assert_not_called()

    def test_unexpected_exception_or_argument_never_prints_secret(self):
        output = io.StringIO()
        with redirect_stderr(output), patch.object(entry, 'enter', side_effect=RuntimeError(DUMMY)):
            self.assertEqual(entry.main(['create']), 1)
            self.assertEqual(entry.main([DUMMY]), 2)
        self.assertNotIn(DUMMY, output.getvalue())


class NativeWriteTests(TestCase):
    def fixture(self, exists):
        def out(pointer, value): c.cast(pointer, c.POINTER(c.c_void_p))[0] = c.c_void_p(value)
        def previous(pointer): c.cast(pointer, c.POINTER(c.c_bool))[0] = False; return 0
        def opened(path, pointer): out(pointer, 10); return 0
        def found(*args):
            if exists: out(args[-1], 20)
            return 0 if exists else -25300
        def access(label, trusted, pointer): out(pointer, 30); return 0
        def create(*args): out(args[-1], 40); return 0
        sec = SimpleNamespace(SecKeychainGetUserInteractionAllowed=Mock(side_effect=previous),
            SecKeychainSetUserInteractionAllowed=Mock(return_value=0), SecKeychainOpen=Mock(side_effect=opened),
            SecKeychainFindGenericPassword=Mock(side_effect=found), SecAccessCreate=Mock(side_effect=access),
            SecKeychainItemCreateFromContent=Mock(side_effect=create), SecKeychainItemModifyAttributesAndData=Mock(return_value=0))
        cf = SimpleNamespace(CFStringCreateWithCString=Mock(return_value=50), CFArrayCreate=Mock(return_value=60), CFRelease=Mock())
        return sec, cf

    def run_native(self, exists, replace):
        sec, cf = self.fixture(exists)
        with patch.object(entry.c, 'CDLL', side_effect=[sec, cf]), patch.object(entry.c.util, 'find_library', return_value='dummy'):
            entry.native_store(DUMMY.encode(), Path('/dummy/login.keychain-db'), replace=replace)
        lookup = sec.SecKeychainFindGenericPassword.call_args.args
        self.assertEqual(lookup[2], entry.setup.SERVICE.encode())
        self.assertEqual(lookup[4], entry.setup.ACCOUNT.encode())
        self.assertIsNone(lookup[5]); self.assertIsNone(lookup[6])  # Never reads old password.
        self.assertEqual(sec.SecKeychainSetUserInteractionAllowed.call_args.args, (False,))
        return sec, cf

    def test_new_item_uses_empty_trusted_apps_and_full_byte_count(self):
        sec, cf = self.run_native(False, False)
        cf.CFArrayCreate.assert_called_once_with(None, None, 0, None)
        sec.SecAccessCreate.assert_called_once()
        arguments = sec.SecKeychainItemCreateFromContent.call_args.args
        self.assertEqual(arguments[2], 164); self.assertEqual(arguments[3], DUMMY.encode())
        sec.SecKeychainItemModifyAttributesAndData.assert_not_called()

    def test_replace_changes_data_only_preserving_existing_access(self):
        sec, cf = self.run_native(True, True)
        arguments = sec.SecKeychainItemModifyAttributesAndData.call_args.args
        self.assertIsNone(arguments[1]); self.assertEqual(arguments[2], 164)
        self.assertEqual(arguments[3], DUMMY.encode())
        sec.SecAccessCreate.assert_not_called(); sec.SecKeychainItemCreateFromContent.assert_not_called()

    def test_create_race_never_overwrites(self):
        sec, cf = self.fixture(True)
        with patch.object(entry.c, 'CDLL', side_effect=[sec, cf]), patch.object(entry.c.util, 'find_library', return_value='dummy'):
            with self.assertRaises(entry.EntryError): entry.native_store(DUMMY.encode(), Path('/dummy'), replace=False)
        sec.SecKeychainItemModifyAttributesAndData.assert_not_called(); sec.SecKeychainItemCreateFromContent.assert_not_called()
