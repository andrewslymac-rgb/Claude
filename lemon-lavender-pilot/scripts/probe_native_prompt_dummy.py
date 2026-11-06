"""Probe libc's hidden getpass with generated dummy input in a private PTY.

No Keychain API/command, clipboard, network, user terminal or real input.
Only the dummy comparison results are printed or saved.
"""
import ctypes as c
import getpass
import json
import os
from pathlib import Path
import pty
import select
import signal
import sys
import termios
import time

DUMMY = b'sk-proj-' + b'D' * 156
CASES = [('return_lf', DUMMY + b'\n'), ('return_cr', DUMMY + b'\r'),
         ('pasted_crlf', DUMMY + b'\r\n'), ('outer_space', DUMMY + b' \n'),
         ('bracketed_paste', b'\x1b[200~' + DUMMY + b'\x1b[201~\n')]
PYTHON_PROMPT = sys.argv[1:] == ['--python']


def probe(name, supplied):
    pid, fd = pty.fork()
    if pid == 0:
        try:
            if PYTHON_PROMPT:
                result = getpass.getpass('DUMMY-ONLY-PROMPT: ').encode()
            else:
                libc = c.CDLL('/usr/lib/libSystem.B.dylib')
                libc.getpass.argtypes = [c.c_char_p]; libc.getpass.restype = c.c_void_p
                pointer = libc.getpass(b'DUMMY-ONLY-PROMPT: ')
                result = c.string_at(pointer) if pointer else b''
            print('DUMMY-RESULT:' + json.dumps({'case': name, 'matches_dummy_exactly': result == DUMMY,
                'returned_dummy_bytes': len(result), 'contains_control': any(v < 32 or v == 127 for v in result)}), flush=True)
            os._exit(0)
        except BaseException:
            os._exit(1)
    captured = b''; sent = False
    try:
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if select.select([fd], [], [], .1)[0]:
                try: chunk = os.read(fd, 8192)
                except OSError: break
                if not chunk: break
                captured += chunk
            if not sent and b'DUMMY-ONLY-PROMPT: ' in captured:
                if termios.tcgetattr(fd)[3] & termios.ECHO:
                    continue  # Prompt can be written just before echo is disabled.
                os.write(fd, supplied); sent = True
            if b'DUMMY-RESULT:' in captured and b'\n' in captured.split(b'DUMMY-RESULT:', 1)[1]:
                payload = captured.split(b'DUMMY-RESULT:', 1)[1].splitlines()[0]
                result = json.loads(payload)
                result['terminal_echo_disabled'] = True
                return result
        raise RuntimeError('Dummy prompt probe did not complete.')
    finally:
        done, _ = os.waitpid(pid, os.WNOHANG)
        if not done:
            os.kill(pid, signal.SIGTERM); os.waitpid(pid, 0)
        os.close(fd)


if __name__ == '__main__':
    if sys.argv[1:] not in ([], ['--python']):
        print('Only --python is accepted. Dummy input is built in.'); raise SystemExit(2)
    results = [probe(*case) for case in CASES]
    report = {'method': 'python-getpass' if PYTHON_PROMPT else 'native-libc-getpass', 'dummy_prompt_results': results, 'keychain_access': False, 'clipboard_access': False, 'api_requests': 0}
    filename = 'credential-python-prompt-diagnosis.json' if PYTHON_PROMPT else 'credential-dummy-prompt-diagnosis.json'
    (Path(__file__).resolve().parent.parent / 'artifacts' / filename).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
