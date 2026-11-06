"""Native Keychain read into server memory only. Never use the security -w CLI."""
import ctypes as c
import ctypes.util
import threading
from .keychain_setup import SERVICE, ACCOUNT, login_keychain

_lock = threading.Lock()
MIN_KEY_BYTES = 20  # Local plausibility guard, not a claimed provider key length.
MAX_KEY_BYTES = 8192  # Bounded memory/header size; well below 64 KiB total headers.


class CredentialUnavailable(Exception):
    def __init__(self, code='native_reader_unavailable'):
        # Codes are fixed by this module, never a native exception or key text.
        self.code = code
        super().__init__('Keychain unavailable (' + code + '). No API request was made. '
                         'Share only this error code, never the saved key.')


def decode_key(raw):
    """Validate without altering a credential or assuming an exact key length.

    Surrounding whitespace, quoting and control sequences are not silently
    removed. This is a local header-safety check, not proof of API validity.
    """
    if not MIN_KEY_BYTES <= len(raw) <= MAX_KEY_BYTES:
        raise CredentialUnavailable('saved_key_length_invalid')
    try:
        value = raw.decode('ascii')
    except UnicodeDecodeError:
        raise CredentialUnavailable('saved_key_encoding_invalid') from None
    if value != value.strip():
        raise CredentialUnavailable('saved_key_outer_whitespace')
    if any(ch.isspace() for ch in value):
        raise CredentialUnavailable('saved_key_embedded_whitespace')
    if any(ord(ch) < 33 or ord(ch) > 126 for ch in value):
        raise CredentialUnavailable('saved_key_control_characters')
    if not value.startswith('sk-'):
        raise CredentialUnavailable('saved_key_prefix_invalid')
    return ServerSecret(value)


class ServerSecret:
    __slots__ = ('_value',)

    def __init__(self, value):
        self._value = value

    def __repr__(self):
        return '<ServerSecret: redacted>'

    __str__ = __repr__

    def authorization(self):
        return 'Bearer ' + self._value


def read_project_key(*, allow_prompt=False):
    """allow_prompt is only used by the explicit human-run test launcher.

    The returned object must never enter a response, log, settings object or
    database. No fallback to environment variables, files or another Keychain.
    """
    keychain_path = str(login_keychain()).encode()
    with _lock:
        issue = 'native_reader_unavailable'
        try:
            sec = c.CDLL(ctypes.util.find_library('Security'))
            cf = c.CDLL(ctypes.util.find_library('CoreFoundation'))
            sec.SecKeychainSetUserInteractionAllowed.argtypes = [c.c_bool]
            sec.SecKeychainGetUserInteractionAllowed.argtypes = [c.POINTER(c.c_bool)]
            sec.SecKeychainOpen.argtypes = [c.c_char_p, c.POINTER(c.c_void_p)]
            sec.SecKeychainFindGenericPassword.argtypes = [c.c_void_p, c.c_uint32, c.c_char_p,
                c.c_uint32, c.c_char_p, c.POINTER(c.c_uint32), c.POINTER(c.c_void_p), c.c_void_p]
            sec.SecKeychainItemFreeContent.argtypes = [c.c_void_p, c.c_void_p]
            cf.CFRelease.argtypes = [c.c_void_p]
            for name in ('SecKeychainSetUserInteractionAllowed', 'SecKeychainGetUserInteractionAllowed',
                         'SecKeychainOpen', 'SecKeychainFindGenericPassword', 'SecKeychainItemFreeContent'):
                getattr(sec, name).restype = c.c_int32  # OSStatus, per installed Apple headers.
            cf.CFRelease.restype = None
            previous = c.c_bool()
            if sec.SecKeychainGetUserInteractionAllowed(c.byref(previous)) != 0:
                raise CredentialUnavailable
            ref, password, length = c.c_void_p(), c.c_void_p(), c.c_uint32()
            try:
                if sec.SecKeychainSetUserInteractionAllowed(allow_prompt) != 0:
                    raise CredentialUnavailable
                if sec.SecKeychainOpen(keychain_path, c.byref(ref)) != 0:
                    raise CredentialUnavailable
                service, account = SERVICE.encode(), ACCOUNT.encode()
                status = sec.SecKeychainFindGenericPassword(ref, len(service), service,
                    len(account), account, c.byref(length), c.byref(password), None)
                if status != 0:
                    issue = {-25308: 'macos_interaction_required', -25293: 'macos_authorization_denied',
                             -25300: 'training_key_not_found'}.get(status, 'native_keychain_read_denied')
                    raise CredentialUnavailable(issue)
                if not MIN_KEY_BYTES <= length.value <= MAX_KEY_BYTES:
                    raise CredentialUnavailable('saved_key_length_invalid')
                issue = 'native_buffer_read_failed'
                if not password:
                    raise CredentialUnavailable(issue)
                return decode_key(c.string_at(password, length.value))
            finally:
                # Every cleanup is attempted, even if an earlier one fails.
                # A native failure here must not be called a malformed key.
                cleanup_failed = False
                try:
                    if password and sec.SecKeychainItemFreeContent(None, password) != 0:
                        cleanup_failed = True
                except Exception:
                    cleanup_failed = True
                try:
                    if ref:
                        cf.CFRelease(ref)
                except Exception:
                    cleanup_failed = True
                try:
                    if sec.SecKeychainSetUserInteractionAllowed(previous.value) != 0:
                        cleanup_failed = True
                except Exception:
                    cleanup_failed = True
                if cleanup_failed:
                    raise CredentialUnavailable('native_cleanup_failed') from None
        except CredentialUnavailable:
            raise
        except Exception:
            # Do not include native values, exceptions, or tracebacks.
            raise CredentialUnavailable(issue) from None
