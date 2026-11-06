"""Presence checks and human-only setup launcher; never contacts OpenAI.

The short-lived secure entry subprocess owns hidden input and native storage.
This wrapper never receives the value. The old security -w/getpass path is not
used: the installed native getpass truncates long values at 128 bytes.
"""
from pathlib import Path
import shlex
import subprocess
import sys
import termios

SECURITY = '/usr/bin/security'
SERVICE = 'com.lemonlavender.training-center.openai'
ACCOUNT = 'training-center-project-api-key'
LABEL = 'Lemon & Lavender Training Center - OpenAI API'
NOT_FOUND = 44  # security CLI exit status for errSecItemNotFound (-25300).


class SetupError(Exception):
    """Only fixed, non-secret messages may be raised from this module."""


def _metadata(arguments):
    """Only callers below are allowed: default location or item attributes.

    Never add -g/-w to a find command; those retrieve the actual password.
    Native error output is discarded rather than copied into app logs.
    """
    try:
        return subprocess.run(
            [SECURITY, *arguments], stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, timeout=10, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        raise SetupError('Keychain could not be checked. No credential was read.') from None


def login_keychain():
    if sys.platform != 'darwin':
        raise SetupError('This setup requires macOS Keychain. There is no plaintext fallback.')
    result = _metadata(['default-keychain', '-d', 'user'])
    if result.returncode:
        raise SetupError('The default login Keychain is unavailable. Resolve any macOS prompt yourself, then retry.')
    try:
        values = shlex.split(result.stdout.strip())
        if len(values) != 1:
            raise ValueError
        path = Path(values[0]).expanduser().resolve()
    except (ValueError, OSError, RuntimeError):
        raise SetupError('The login Keychain location could not be verified.') from None
    allowed = {(Path.home() / 'Library' / 'Keychains' / name).resolve()
               for name in ('login.keychain-db', 'login.keychain')}
    if path not in allowed:
        raise SetupError('The default Keychain is not your login Keychain. No settings were changed; ask for help before proceeding.')
    return path


def credential_present(keychain):
    # This returns attributes only, never password data. Scope to one item and
    # the verified login Keychain rather than searching all user keychains.
    result = _metadata(['find-generic-password', '-a', ACCOUNT, '-s', SERVICE, str(keychain)])
    if result.returncode == 0:
        return True
    if result.returncode == NOT_FOUND:
        return False
    raise SetupError('Keychain access was not confirmed. No credential was read or overwritten.')


def add_command():
    # No secret in arguments. The child uses full-length Python hidden entry
    # and native Security.framework with an empty trusted-application list.
    return [sys.executable, '-B', str(Path(__file__).resolve().parent.parent /
                                    'scripts' / 'secure_keychain_entry.py'), 'create']


def configure(stdin=None, stdout=None, stderr=None):
    stdin = sys.stdin if stdin is None else stdin
    stdout = sys.stdout if stdout is None else stdout
    stderr = sys.stderr if stderr is None else stderr
    if not all(stream.isatty() for stream in (stdin, stdout, stderr)):
        raise SetupError('Open configure-openai.command in Terminal. Piped input, redirected output, and browser entry are disabled.')
    keychain = login_keychain()
    if credential_present(keychain):
        raise SetupError('A Training Center credential already exists. It was not read or replaced. Use --status to check presence.')
    print('Lemon & Lavender Training Center — local Keychain setup', file=stdout)
    print('No API request will be made. Live voice remains disabled.', file=stdout)
    print('At the next two password prompts, enter the same project API key.', file=stdout)
    print('Characters will not appear. Do not put the key in a shell command or chat.', file=stdout)
    print('Press Control-C to cancel. Handle any macOS permission prompt yourself.', file=stdout, flush=True)
    try:
        original_terminal = termios.tcgetattr(stdin.fileno())
    except (OSError, termios.error):
        raise SetupError('A private interactive terminal could not be confirmed.') from None
    try:
        # Recheck the default before the separately scoped entry helper.
        if login_keychain() != keychain:
            raise SetupError('The default Keychain changed. Setup stopped without entering a key.')
        result = subprocess.run(add_command(), stdin=stdin, stdout=stdout,
                                stderr=stderr, check=False)
    except KeyboardInterrupt:
        raise SetupError('Setup interrupted. Check --status before retrying; no key was read by this program.') from None
    except (OSError, subprocess.SubprocessError):
        raise SetupError('Native Keychain setup could not finish. Check --status before retrying.') from None
    finally:
        try:
            termios.tcsetattr(stdin.fileno(), termios.TCSADRAIN, original_terminal)
        except (OSError, termios.error):
            pass
    if result.returncode:
        raise SetupError('Keychain did not confirm a save. No existing item was overwritten; check --status before retrying.')
    if not credential_present(keychain):
        raise SetupError('A save could not be confirmed. No key was read; check Keychain Access before retrying.')
    print('Saved in your login Keychain. The key was not displayed or sent to a browser.', file=stdout)
    print('Presence only is confirmed; OpenAI access and billing have not been tested.', file=stdout)


def main(arguments=None):
    arguments = sys.argv[1:] if arguments is None else arguments
    # Do not let argparse echo unexpected arguments (which could be a key).
    if arguments not in ([], ['--status'], ['--help']):
        print('Unsupported arguments. Never pass a key on the command line.', file=sys.stderr)
        return 2
    if arguments == ['--help']:
        print('Open configure-openai.command in Terminal for hidden entry. Use --status for presence only. No API calls.')
        return 0
    try:
        if arguments == ['--status']:
            present = credential_present(login_keychain())
            print('Training Center credential: ' + ('present' if present else 'not present') + '. No key read; API access untested.')
        else:
            configure()
        return 0
    except SetupError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception:
        # No traceback or arbitrary native output in the user-facing path.
        print('Local setup stopped. No API call was made. Ask for help without sharing the key.', file=sys.stderr)
        return 1
