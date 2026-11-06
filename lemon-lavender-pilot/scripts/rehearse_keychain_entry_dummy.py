"""Exercise the complete replacement prompt in a private PTY, dummy input only.

No Keychain/clipboard/API access: metadata and writer are replaced before entry.
Child launches through zsh and ordinary CPython, like the .command launcher.
Output contains only known-dummy measurements and fixed error codes.
"""
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
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
CASES = [
    {'name': 'normal_20_minimum', 'size': 20, 'ending': '\r'},
    {'name': 'normal_164_cr', 'size': 164, 'ending': '\r'},
    {'name': 'normal_200_lf', 'size': 200, 'ending': '\n'},
    {'name': 'normal_512_crlf', 'size': 512, 'ending': '\r\n'},
    {'name': 'normal_1023', 'size': 1023, 'ending': '\r'},
    {'name': 'normal_1024', 'size': 1024, 'ending': '\r'},
    {'name': 'normal_1200', 'size': 1200, 'ending': '\r'},
    {'name': 'normal_4096', 'size': 4096, 'ending': '\r'},
    {'name': 'normal_8192_maximum', 'size': 8192, 'ending': '\r'},
    {'name': 'over_limit_8193', 'size': 8193, 'ending': '\r', 'reject': True},
    {'name': 'delayed_confirmation_lf', 'size': 164, 'ending': '\r', 'first': '\n'},
    {'name': 'leading_paste_newline', 'size': 164, 'ending': '\r', 'first': '\n{key}\r'},
    {'name': 'blank_return', 'size': 164, 'ending': '\r', 'first': '\r'},
    {'name': 'terminal_framed_paste', 'size': 164, 'ending': '\r', 'framed': True},
    {'name': 'terminal_framed_paste_4096', 'size': 4096, 'ending': '\r', 'framed': True},
    {'name': 'terminal_multiline_paste_rejected', 'size': 164, 'ending': '\r', 'first': '\x1b[200~{key}\nextra\x1b[201~\r', 'reject': True},
    {'name': 'cancel_at_first_hidden_prompt', 'size': 164, 'ending': '\r', 'first': '\x03', 'reject': True},
]


def dummy(size):
    return 'sk-proj-' + ('Ab9_xY7-' * (size // 8 + 1))[:size - 8]


def child(index, after):
    from training import keychain_entry as entry
    case = CASES[index]; expected = dummy(case['size'])
    measurements = []; writes = []
    original_read = entry.HiddenTerminal.read
    def hidden(prompt, **kwargs):
        value = getpass.getpass(prompt, **kwargs)
        measurements.append({'dummy_bytes_received': len(value.encode()), 'exact_dummy': value == expected})
        return value
    def traced_read(terminal, prompt, **kwargs):
        value = original_read(terminal, prompt, **kwargs)
        measurements.append({'dummy_bytes_received': len(value.encode()), 'exact_dummy': value == expected})
        return value
    def write(payload, path, **kwargs):
        writes.append({'dummy_bytes_written': len(payload), 'exact_dummy': payload == expected.encode()})
    code = ''
    with patch.object(entry.setup, 'login_keychain', return_value=Path('/dummy/login.keychain-db')), \
         patch.object(entry.setup, 'credential_present', return_value=True), patch.object(entry, 'native_store', side_effect=write), \
         patch.object(entry.HiddenTerminal, 'read', traced_read):
        try: entry.enter('replace', **({} if after else {'hidden': hidden}))
        except entry.CredentialUnavailable as exc: code = exc.code
        except (entry.EntryError, entry.SecretInputError) as exc: code = str(exc)
        except (KeyboardInterrupt, EOFError): code = 'cancelled'
        except Exception: code = 'dummy_entry_exception'
    print('DUMMY-RESULT:' + json.dumps({'case': case['name'], 'hidden_reads': measurements,
        'writes': writes, 'error_code': code, 'keychain_access': False, 'clipboard_access': False}), flush=True)


def probe(index, after):
    case = CASES[index]; expected = dummy(case['size'])
    pid, fd = pty.fork()
    if pid == 0:
        os.execv('/bin/zsh', ['/bin/zsh', '-f', '-c', 'exec "$1" -B "$2" --child "$3" "$4"',
            'dummy-entry', sys.executable, str(Path(__file__).resolve()), str(index), 'after' if after else 'before'])
    received = b''; confirmation = False; first = False; second = False
    canonical = None; echo_off = None; recovered = False
    os.set_blocking(fd, False)
    def send(value):
        pending = value.encode(); end = time.monotonic() + 4
        while pending and time.monotonic() < end:
            if select.select([], [fd], [], .03)[1]:
                try: pending = pending[os.write(fd, pending):]
                except BlockingIOError: pass
        if pending: raise RuntimeError('Dummy input was not fully delivered.')
    def key_input():
        return ('\x1b[200~' + expected + '\x1b[201~' if case.get('framed') else expected) + case['ending']
    try:
        deadline = time.monotonic() + 6
        while time.monotonic() < deadline:
            if select.select([fd], [], [], .03)[0]:
                try: chunk = os.read(fd, 32768)
                except OSError: break
                if not chunk: break
                received += chunk
            if b'DUMMY-RESULT:' in received and b'\n' in received.split(b'DUMMY-RESULT:', 1)[1]:
                report = json.loads(received.split(b'DUMMY-RESULT:', 1)[1].splitlines()[0])
                report.update(first_prompt_canonical=canonical, first_prompt_echo_off=echo_off)
                mode = termios.tcgetattr(fd)
                report.update(echo_restored=bool(mode[3] & termios.ECHO), canonical_restored=bool(mode[3] & termios.ICANON),
                    dummy_value_echoed=expected.encode() in received, empty_input_recovered=recovered,
                    passed=(not report['writes'] if case.get('reject') else bool(report['writes']) and all(v['exact_dummy'] for v in report['writes'])))
                return report
            if not confirmation and b'press Return to cancel:' in received:
                send('REPLACE TRAINING KEY\r'); confirmation = True
            if not first and b'Project API key (hidden):' in received:
                attrs = termios.tcgetattr(fd)
                if attrs[3] & termios.ECHO: continue
                canonical = bool(attrs[3] & termios.ICANON); echo_off = True
                value = case.get('first', key_input()).replace('{key}', expected)
                send(value); first = True
            if after and first and not recovered and case.get('first') in ('\r', '\n') and b'No key text received yet.' in received:
                send(key_input()); recovered = True
            if not second and b'Retype project API key (hidden):' in received:
                if termios.tcgetattr(fd)[3] & termios.ECHO: continue
                send(key_input()); second = True
        return {'case': case['name'], 'probe_timeout_or_early_exit': True,
                'first_prompt_canonical': canonical, 'first_prompt_echo_off': echo_off}
    finally:
        done, _ = os.waitpid(pid, os.WNOHANG)
        if not done: os.kill(pid, signal.SIGTERM); os.waitpid(pid, 0)
        os.close(fd)


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == '--child':
        child(int(sys.argv[2]), sys.argv[3] == 'after'); raise SystemExit
    if sys.argv[1:] not in ([], ['--after']):
        print('Only --after is accepted. Dummy cases are built in.'); raise SystemExit(2)
    after = sys.argv[1:] == ['--after']
    results = [probe(index, after) for index in range(len(CASES))]
    filename = 'credential-full-flow-after.json' if after else 'credential-full-flow-before.json'
    (ROOT / 'artifacts' / filename).write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))
