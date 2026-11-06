"""Human-only full-length hidden entry and narrowly scoped native Keychain write.

The value exists only in this short-lived process and native Keychain memory.
Never pass it to a subprocess, logger, file, environment, HTTP client or browser.
"""
import ctypes as c
import ctypes.util
import getpass
import hmac
from pathlib import Path
import sys
import warnings
from contextlib import nullcontext
from . import keychain_setup as setup
from .live_credentials import decode_key, CredentialUnavailable, MIN_KEY_BYTES, MAX_KEY_BYTES
from .secret_input import HiddenTerminal, SecretInputError


class EntryError(Exception):
    pass


class Attribute(c.Structure):
    _fields_ = [('tag', c.c_uint32), ('length', c.c_uint32), ('data', c.c_void_p)]


class AttributeList(c.Structure):
    _fields_ = [('count', c.c_uint32), ('attr', c.POINTER(Attribute))]


def native_store(payload, keychain, *, replace, allow_prompt=True):
    """Write data only; replacing keeps the existing attributes and access list.

    Lookup passes NULL for both password outputs: existing data is never read.
    New entries use an explicitly empty trusted-application list, matching the
    previous -T '' policy. No broad or persistent application grant is added.
    """
    sec = c.CDLL(c.util.find_library('Security')); cf = c.CDLL(c.util.find_library('CoreFoundation'))
    functions = {
        'SecKeychainGetUserInteractionAllowed': [c.POINTER(c.c_bool)],
        'SecKeychainSetUserInteractionAllowed': [c.c_bool],
        'SecKeychainOpen': [c.c_char_p, c.POINTER(c.c_void_p)],
        'SecKeychainFindGenericPassword': [c.c_void_p, c.c_uint32, c.c_char_p, c.c_uint32,
            c.c_char_p, c.c_void_p, c.c_void_p, c.POINTER(c.c_void_p)],
        'SecKeychainItemModifyAttributesAndData': [c.c_void_p, c.c_void_p, c.c_uint32, c.c_void_p],
        'SecAccessCreate': [c.c_void_p, c.c_void_p, c.POINTER(c.c_void_p)],
        'SecKeychainItemCreateFromContent': [c.c_uint32, c.POINTER(AttributeList), c.c_uint32,
            c.c_void_p, c.c_void_p, c.c_void_p, c.POINTER(c.c_void_p)],
    }
    for name, signature in functions.items():
        getattr(sec, name).argtypes = signature; getattr(sec, name).restype = c.c_int32
    cf.CFStringCreateWithCString.argtypes = [c.c_void_p, c.c_char_p, c.c_uint32]
    cf.CFStringCreateWithCString.restype = c.c_void_p
    cf.CFArrayCreate.argtypes = [c.c_void_p, c.c_void_p, c.c_long, c.c_void_p]
    cf.CFArrayCreate.restype = c.c_void_p
    cf.CFRelease.argtypes = [c.c_void_p]; cf.CFRelease.restype = None
    previous = c.c_bool(); ref = c.c_void_p(); item = c.c_void_p(); access = c.c_void_p()
    label = trusted = None
    if sec.SecKeychainGetUserInteractionAllowed(c.byref(previous)) != 0:
        raise EntryError('Native Keychain interaction could not be verified. Nothing was changed.')
    try:
        if sec.SecKeychainSetUserInteractionAllowed(allow_prompt) != 0:
            raise EntryError('Native Keychain prompt could not be enabled. Nothing was changed.')
        if sec.SecKeychainOpen(str(keychain).encode(), c.byref(ref)) != 0:
            raise EntryError('Login Keychain could not be opened. Nothing was changed.')
        service, account = setup.SERVICE.encode(), setup.ACCOUNT.encode()
        status = sec.SecKeychainFindGenericPassword(ref, len(service), service, len(account), account,
            None, None, c.byref(item))
        if replace:
            if status != 0 or not item:
                raise EntryError('The existing Training Center item could not be identified. Nothing was replaced.')
            # NULL attributes preserves service/account/label and access control.
            status = sec.SecKeychainItemModifyAttributesAndData(item, None, len(payload), payload)
        else:
            if status != -25300:
                raise EntryError('A credential exists or its absence is unconfirmed. Nothing was overwritten.')
            label = cf.CFStringCreateWithCString(None, setup.LABEL.encode(), 0x08000100)
            trusted = cf.CFArrayCreate(None, None, 0, None)
            if not label or not trusted or sec.SecAccessCreate(label, trusted, c.byref(access)) != 0:
                raise EntryError('Restricted access control could not be created. Nothing was saved.')
            values = [('svce', service), ('acct', account), ('labl', setup.LABEL.encode())]
            buffers = [c.create_string_buffer(value) for _, value in values]
            attributes = (Attribute * len(values))(*[
                Attribute(int.from_bytes(tag.encode(), 'big'), len(value), c.cast(buffer, c.c_void_p))
                for (tag, value), buffer in zip(values, buffers)])
            attribute_list = AttributeList(len(values), attributes)
            status = sec.SecKeychainItemCreateFromContent(int.from_bytes(b'genp', 'big'),
                c.byref(attribute_list), len(payload), payload, ref, access, c.byref(item))
        if status != 0:
            raise EntryError('macOS did not confirm the credential save. Handle its prompt personally; no API request was made.')
    finally:
        for reference in (item, access, trusted, label, ref):
            if reference: cf.CFRelease(reference)
        sec.SecKeychainSetUserInteractionAllowed(previous.value)


def enter(mode, *, stdin=None, stdout=None, stderr=None, hidden=None, confirm=None):
    stdin = sys.stdin if stdin is None else stdin
    stdout = sys.stdout if stdout is None else stdout
    stderr = sys.stderr if stderr is None else stderr
    confirm = input if confirm is None else confirm
    if mode not in ('create', 'replace') or not all(stream.isatty() for stream in (stdin, stdout, stderr)):
        raise EntryError('Open the launcher in Terminal with no key arguments. Redirected or piped entry is disabled.')
    keychain = setup.login_keychain()
    exists = setup.credential_present(keychain)
    if mode == 'create' and exists:
        raise EntryError('A Training Center credential already exists. It was not read or replaced.')
    if mode == 'replace':
        if not exists:
            raise EntryError('No existing Training Center credential was confirmed. Nothing was replaced.')
        print('This replaces only the saved Training Center API key. Existing access controls stay unchanged.', file=stdout)
        print('The old saved value cannot be restored by this helper. It will not be read, displayed, deleted, or revoked.', file=stdout)
        print('Proceed only after approving this local replacement. No API request will run.', file=stdout, flush=True)
        if confirm('Type REPLACE TRAINING KEY to authorize this change, or press Return to cancel: ') != 'REPLACE TRAINING KEY':
            raise EntryError('Replacement canceled. Nothing was changed.')
    print('Wait for the hidden prompt, paste the complete project key, then press Return. Control-C cancels.', file=stdout, flush=True)
    # Keep one noncanonical hidden terminal across both entries. Canonical
    # getpass stalls at this Mac's 1024-byte line limit and an empty first line
    # previously caused a misleading Keychain error before any write.
    with (HiddenTerminal() if hidden is None else nullcontext()) as terminal:
        read = terminal.read if terminal is not None else hidden
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            first = read('Project API key (hidden): ', stream=stderr)
            raw = first.encode('utf-8')
            if not raw:
                raise EntryError('No key text was received. Nothing was changed.')
            if len(raw) < MIN_KEY_BYTES:
                raise EntryError('The entry is too short for the local key check. Copy the complete issued key; nothing was changed.')
            if len(raw) > MAX_KEY_BYTES:
                raise EntryError('The entry exceeds the local 8192-byte limit. Nothing was truncated or changed.')
            try:
                decode_key(raw)
            except CredentialUnavailable as exc:
                raise EntryError('Entry rejected (' + exc.code.replace('saved_key_', 'entry_') + '). Nothing was changed.') from None
            second = read('Retype project API key (hidden): ', stream=stderr)
    if not hmac.compare_digest(first.encode('utf-8'), second.encode('utf-8')):
        raise EntryError('Entries did not match. Nothing was saved or changed; reopen the launcher to try again.')
    payload = first.encode('ascii')
    del first, second
    if setup.login_keychain() != keychain:
        raise EntryError('The login Keychain changed. Nothing was saved.')
    native_store(payload, keychain, replace=mode == 'replace')
    del payload
    print('Saved in your login Keychain with the complete validated value. No API request was made.', file=stdout)


def main(arguments=None):
    arguments = sys.argv[1:] if arguments is None else arguments
    if arguments not in (['create'], ['replace']):
        print('Unsupported arguments. Never pass a key on the command line.', file=sys.stderr); return 2
    try:
        enter(arguments[0]); return 0
    except (EntryError, setup.SetupError, CredentialUnavailable, SecretInputError) as exc:
        print(str(exc), file=sys.stderr); return 1
    except (KeyboardInterrupt, EOFError, getpass.GetPassWarning):
        print('Hidden entry canceled or unavailable. No API request was made.', file=sys.stderr); return 1
    except Exception:
        print('Credential entry did not complete. Never share the key or a traceback; no API request was made.', file=sys.stderr); return 1
