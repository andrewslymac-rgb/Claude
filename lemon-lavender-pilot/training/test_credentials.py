"""Dummy-only unit tests. No test below opens or writes an actual Keychain."""
from contextlib import redirect_stdout, redirect_stderr
import io
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, patch

from . import keychain_setup as setup


class KeychainSetupTests(unittest.TestCase):
    def result(self, code=0, output=''):
        return subprocess.CompletedProcess([], code, stdout=output)

    def terminal(self):
        stream = Mock()
        stream.isatty.return_value = True
        stream.fileno.return_value = 9
        return stream

    def test_native_command_has_hidden_prompt_and_no_access_or_overwrite_grant(self):
        command = setup.add_command()
        self.assertEqual(command[0], setup.sys.executable)
        self.assertEqual(command[-1], 'create')
        self.assertTrue(command[-2].endswith('/scripts/secure_keychain_entry.py'))
        self.assertNotIn('-w', command)
        self.assertNotIn('-A', command)
        self.assertNotIn('-U', command)

    def test_presence_checks_attributes_only_and_discards_output(self):
        with patch.object(setup.subprocess, 'run', return_value=self.result()) as run:
            self.assertTrue(setup.credential_present(Path('/fake/login.keychain-db')))
        command = run.call_args.args[0]
        self.assertNotIn('-w', command)
        self.assertNotIn('-g', command)
        self.assertEqual(command[-1], '/fake/login.keychain-db')
        self.assertEqual(run.call_args.kwargs['stderr'], subprocess.DEVNULL)
        self.assertEqual(run.call_args.kwargs['stdin'], subprocess.DEVNULL)

    def test_missing_is_distinct_from_denied_or_locked(self):
        with patch.object(setup, '_metadata', return_value=self.result(44)):
            self.assertFalse(setup.credential_present(Path('/fake')))
        for code in (1, 36, 128):
            with patch.object(setup, '_metadata', return_value=self.result(code)):
                with self.assertRaises(setup.SetupError):
                    setup.credential_present(Path('/fake'))

    def test_metadata_timeout_does_not_reveal_exception(self):
        sentinel = 'DUMMY-ONLY-exception-value'
        with patch.object(setup.subprocess, 'run', side_effect=OSError(sentinel)):
            with self.assertRaises(setup.SetupError) as error:
                setup.credential_present(Path('/fake'))
        self.assertNotIn(sentinel, str(error.exception))

    def test_non_macos_has_no_fallback(self):
        with patch.object(setup.sys, 'platform', 'linux'), patch.object(setup, '_metadata') as metadata:
            with self.assertRaises(setup.SetupError):
                setup.login_keychain()
            metadata.assert_not_called()

    def test_only_verified_default_login_keychain_is_accepted(self):
        expected = Path.home() / 'Library/Keychains/login.keychain-db'
        with patch.object(setup.sys, 'platform', 'darwin'), patch.object(
                setup, '_metadata', return_value=self.result(output='    "' + str(expected) + '"\n')):
            self.assertEqual(setup.login_keychain(), expected.resolve())
        for value in ('"/tmp/unknown.keychain"', 'one two', '"unterminated'):
            with patch.object(setup.sys, 'platform', 'darwin'), patch.object(
                    setup, '_metadata', return_value=self.result(output=value)):
                with self.assertRaises(setup.SetupError):
                    setup.login_keychain()

    def test_terminal_is_required_on_all_three_streams(self):
        for index in range(3):
            streams = [self.terminal() for _ in range(3)]
            streams[index].isatty.return_value = False
            with patch.object(setup, 'login_keychain') as login:
                with self.assertRaises(setup.SetupError):
                    setup.configure(*streams)
                login.assert_not_called()

    def test_existing_credential_stops_before_native_entry(self):
        with patch.object(setup, 'login_keychain', return_value=Path('/fake')), patch.object(
                setup, 'credential_present', return_value=True), patch.object(setup.subprocess, 'run') as run:
            with self.assertRaises(setup.SetupError):
                setup.configure(*[self.terminal() for _ in range(3)])
            run.assert_not_called()

    def test_default_change_stops_before_entry_and_restores_terminal(self):
        with patch.object(setup, 'login_keychain', side_effect=[Path('/first'), Path('/second')]), patch.object(
                setup, 'credential_present', return_value=False), patch.object(setup.subprocess, 'run') as run, patch.object(
                setup.termios, 'tcgetattr', return_value=['original']), patch.object(setup.termios, 'tcsetattr') as restore:
            with self.assertRaises(setup.SetupError):
                setup.configure(*[self.terminal() for _ in range(3)])
            run.assert_not_called()
            restore.assert_called_once()

    def test_success_uses_inherited_terminal_and_never_reads_password(self):
        streams = [self.terminal() for _ in range(3)]
        with patch.object(setup, 'login_keychain', return_value=Path('/fake')), patch.object(
                setup, 'credential_present', side_effect=[False, True]), patch.object(
                setup.termios, 'tcgetattr', return_value=['original']), patch.object(
                setup.termios, 'tcsetattr') as restore, patch.object(
                setup.subprocess, 'run', return_value=self.result()) as run:
            setup.configure(*streams)
            self.assertEqual(run.call_args.args[0], setup.add_command())
            self.assertIs(run.call_args.kwargs['stdin'], streams[0])
            self.assertNotIn('input', run.call_args.kwargs)
            self.assertNotIn('env', run.call_args.kwargs)
            self.assertNotIn('shell', run.call_args.kwargs)
            restore.assert_called_once()
            for stream in streams:
                stream.read.assert_not_called()

    def test_failed_or_interrupted_save_is_not_reported_as_success(self):
        for failure in (self.result(1), KeyboardInterrupt(), OSError('DUMMY-error')):
            with patch.object(setup, 'login_keychain', return_value=Path('/fake')), patch.object(
                    setup, 'credential_present', return_value=False) as presence, patch.object(
                    setup.termios, 'tcgetattr', return_value=['original']), patch.object(
                    setup.termios, 'tcsetattr') as restore, patch.object(setup.subprocess, 'run') as run:
                if isinstance(failure, BaseException):
                    run.side_effect = failure
                else:
                    run.return_value = failure
                with self.assertRaises(setup.SetupError):
                    setup.configure(*[self.terminal() for _ in range(3)])
                restore.assert_called_once()
                presence.assert_called_once()

    def test_missing_post_save_confirmation_is_failure(self):
        with patch.object(setup, 'login_keychain', return_value=Path('/fake')), patch.object(
                setup, 'credential_present', return_value=False), patch.object(
                setup.termios, 'tcgetattr', return_value=[]), patch.object(
                setup.termios, 'tcsetattr'), patch.object(setup.subprocess, 'run', return_value=self.result()):
            with self.assertRaises(setup.SetupError):
                setup.configure(*[self.terminal() for _ in range(3)])

    def test_unexpected_cli_argument_is_never_echoed(self):
        dummy = 'DUMMY-ONLY-do-not-echo'
        output = io.StringIO()
        with redirect_stderr(output), patch.object(setup, 'configure') as configure:
            self.assertEqual(setup.main([dummy]), 2)
            configure.assert_not_called()
        self.assertNotIn(dummy, output.getvalue())

    def test_status_only_reports_presence_and_no_runtime_access_claim(self):
        for present in (True, False):
            output = io.StringIO()
            with redirect_stdout(output), patch.object(setup, 'login_keychain', return_value=Path('/fake')), patch.object(
                    setup, 'credential_present', return_value=present), patch.object(setup, 'configure') as configure:
                self.assertEqual(setup.main(['--status']), 0)
                configure.assert_not_called()
            self.assertIn('API access untested', output.getvalue())
            self.assertIn('No key read', output.getvalue())

    def test_unexpected_exception_does_not_leak_details(self):
        output = io.StringIO()
        with redirect_stderr(output), patch.object(setup, 'configure', side_effect=RuntimeError('DUMMY-private-detail')):
            self.assertEqual(setup.main([]), 1)
        self.assertNotIn('DUMMY-private-detail', output.getvalue())

    def test_help_never_accesses_keychain(self):
        with redirect_stdout(io.StringIO()), patch.object(setup, 'login_keychain') as login:
            self.assertEqual(setup.main(['--help']), 0)
            login.assert_not_called()
