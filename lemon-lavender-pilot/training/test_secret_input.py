"""No terminal, Keychain, clipboard or network. Bytes are generated dummies."""
from unittest import TestCase
from unittest.mock import Mock, patch
from .secret_input import HiddenTerminal, SecretInputError
from .live_credentials import MAX_KEY_BYTES


class HiddenInputTests(TestCase):
    def reader(self, data):
        terminal = HiddenTerminal(); terminal.fd = 123
        terminal.byte = Mock(side_effect=data)
        return terminal

    def test_empty_line_and_confirmation_crlf_do_not_complete_entry(self):
        value = b'sk-proj-' + b'x' * 156
        terminal = self.reader(b'\r\n\n' + value + b'\r')
        with patch('training.secret_input.os.write') as output:
            self.assertEqual(terminal.read('Hidden: '), value.decode())
        self.assertNotIn(value.decode(), str(output.mock_calls))

    def test_long_value_is_exact_not_canonically_truncated(self):
        for size in (164, 1024, 4096, MAX_KEY_BYTES):
            value = b'sk-proj-' + b'x' * (size - 8)
            with patch('training.secret_input.os.write'):
                self.assertEqual(self.reader(value + b'\r').read('Hidden: '), value.decode())

    def test_over_limit_is_rejected_without_returning_a_prefix(self):
        terminal = self.reader(b'x' * (MAX_KEY_BYTES + 1) + b'\r')
        with patch('training.secret_input.os.write'), self.assertRaises(SecretInputError): terminal.read('Hidden: ')

    def test_only_exact_terminal_paste_framing_is_transport(self):
        value = b'sk-proj-' + b'x' * 156
        with patch('training.secret_input.os.write'):
            self.assertEqual(self.reader(b'\x1b[200~' + value + b'\x1b[201~\r').read('Hidden: '), value.decode())
            with self.assertRaises(SecretInputError):
                self.reader(b'\x1b[200~' + value + b'\nextra\x1b[201~\r').read('Hidden: ')

    def test_spaces_not_trimmed_and_user_editing_is_supported(self):
        with patch('training.secret_input.os.write'):
            self.assertEqual(self.reader(b' abc \r').read('Hidden: '), ' abc ')
            self.assertEqual(self.reader(b'wrong\x15testx\x7f\r').read('Hidden: '), 'test')

    def test_cancel_and_controls_cannot_produce_a_key(self):
        with patch('training.secret_input.os.write'):
            for data, error in ((b'abc\x03', KeyboardInterrupt), (b'abc\x04', EOFError), (b'abc\x00\r', SecretInputError)):
                with self.assertRaises(error): self.reader(data).read('Hidden: ')
