"""Bounded hidden TTY input that does not use the canonical line buffer.

No clipboard access, history, echo, file storage, keychain access or networking.
Terminal paste framing is parsed separately; credential bytes are not trimmed.
"""
import copy
import os
import select
import termios
from .live_credentials import MAX_KEY_BYTES


class SecretInputError(Exception):
    pass


class HiddenTerminal:
    def __init__(self):
        self.fd = None
        self.original = None
        self.pending = bytearray()

    def __enter__(self):
        self.fd = os.open('/dev/tty', os.O_RDWR | os.O_NOCTTY)
        try:
            if not os.isatty(self.fd):
                raise SecretInputError('A private terminal is required. Nothing was changed.')
            self.original = termios.tcgetattr(self.fd)
            mode = copy.deepcopy(self.original)
            mode[0] &= ~(termios.ICRNL | termios.INLCR | termios.IGNCR | termios.ISTRIP | termios.IXON | termios.IXOFF)
            mode[3] &= ~(termios.ECHO | termios.ECHONL | termios.ICANON | termios.IEXTEN | termios.ISIG)
            mode[6][termios.VMIN] = 1
            mode[6][termios.VTIME] = 0
            # Do not flush input at prompt transitions: a delayed CRLF or paste
            # must not erase the value. Flush only when leaving hidden mode.
            termios.tcsetattr(self.fd, termios.TCSANOW, mode)
            os.write(self.fd, b'\x1b[?2004h')  # Request framed paste from Terminal.
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *args):
        self.pending.clear()
        if self.fd is not None:
            try:
                os.write(self.fd, b'\x1b[?2004l')
                if self.original is not None:
                    # Discard queued secret input before restoring terminal echo.
                    termios.tcsetattr(self.fd, termios.TCSAFLUSH, self.original)
            finally:
                os.close(self.fd)
                self.fd = None

    def byte(self, timeout=None):
        if not self.pending:
            if timeout is not None and not select.select([self.fd], [], [], timeout)[0]:
                raise SecretInputError('An incomplete terminal control sequence was received. Nothing was changed.')
            self.pending.extend(os.read(self.fd, 4096))
            if not self.pending:
                raise EOFError
        value = self.pending[0]
        del self.pending[0]
        return value

    def read(self, prompt, **unused):
        os.write(self.fd, prompt.encode('ascii'))
        value = bytearray(); paste = False; invalid = ''; empty_lines = 0
        while True:
            char = self.byte()
            if char == 27:
                sequence = bytes(self.byte(timeout=1) for _ in range(5))
                if sequence == b'[200~' and not paste:
                    paste = True
                elif sequence == b'[201~' and paste:
                    paste = False
                else:
                    invalid = 'Unsupported terminal control input. Nothing was changed.'
                continue
            if char in (3, 4):
                if char == 3: raise KeyboardInterrupt
                raise EOFError
            if char in (10, 13) and not paste:
                if invalid:
                    raise SecretInputError(invalid)
                if not value:
                    empty_lines += 1
                    if empty_lines > 5:
                        raise SecretInputError('No key text was received. Nothing was changed.')
                    os.write(self.fd, b'\nNo key text received yet. Paste at this hidden prompt, then press Return.\n' + prompt.encode('ascii'))
                    continue
                os.write(self.fd, b'\n')
                try:
                    return value.decode('ascii')
                except UnicodeDecodeError:
                    raise SecretInputError('The entry contains non-ASCII text. Nothing was changed.') from None
            if char in (8, 127) and not paste:
                if value: value.pop()
                continue
            if char == 21 and not paste:
                value.clear(); invalid = ''
                continue
            if char in (10, 13) and paste:
                invalid = 'A multiline paste was received. Paste only the key; nothing was changed.'
            elif char < 32 or char == 127:
                invalid = 'Control characters were received. Nothing was changed.'
            if len(value) >= MAX_KEY_BYTES:
                invalid = 'The entry exceeds the local 8192-byte limit. It was not truncated or saved.'
            else:
                value.append(char)
