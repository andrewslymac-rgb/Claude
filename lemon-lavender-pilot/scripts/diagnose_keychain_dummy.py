"""Native bridge probe on newly created dummy-only items; never the real item.

Run manually only. No API/network, clipboard, real credential, ACL change,
password CLI retrieval or interactive prompts. Temporary dummy entries are
deleted in finally blocks. Only pass/fail metadata is printed.
"""
import ctypes as c
import ctypes.util
import json
from pathlib import Path
import sys
from unittest.mock import patch
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from training import live_credentials as reader
from training import keychain_entry as entry
from training.keychain_setup import login_keychain


def main():
    if len(sys.argv) != 1:
        print('No arguments accepted. This diagnostic uses hardcoded dummy data only.'); return 2
    sec = c.CDLL(ctypes.util.find_library('Security'))
    cf = c.CDLL(ctypes.util.find_library('CoreFoundation'))
    signatures = {
        'SecKeychainOpen': [c.c_char_p, c.POINTER(c.c_void_p)],
        'SecKeychainAddGenericPassword': [c.c_void_p, c.c_uint32, c.c_char_p,
            c.c_uint32, c.c_char_p, c.c_uint32, c.c_void_p, c.POINTER(c.c_void_p)],
        'SecKeychainItemDelete': [c.c_void_p],
        'SecKeychainGetUserInteractionAllowed': [c.POINTER(c.c_bool)],
        'SecKeychainSetUserInteractionAllowed': [c.c_bool],
        'SecKeychainFindGenericPassword': [c.c_void_p, c.c_uint32, c.c_char_p,
            c.c_uint32, c.c_char_p, c.c_void_p, c.c_void_p, c.c_void_p],
    }
    for name, signature in signatures.items():
        getattr(sec, name).argtypes = signature; getattr(sec, name).restype = c.c_int32
    cf.CFRelease.argtypes = [c.c_void_p]; cf.CFRelease.restype = None
    ref = c.c_void_p(); previous = c.c_bool(); cases = []
    if sec.SecKeychainGetUserInteractionAllowed(c.byref(previous)) != 0:
        raise RuntimeError('Dummy probe could not verify interaction state.')
    if sec.SecKeychainSetUserInteractionAllowed(False) != 0:
        raise RuntimeError('Dummy probe could not disable prompts.')
    try:
        if sec.SecKeychainOpen(str(login_keychain()).encode(), c.byref(ref)) != 0:
            raise RuntimeError('Dummy probe could not open the login Keychain.')
        for size in (51, 164, 1024, 8192):
            service = 'com.lemonlavender.training-center.dummy-diagnostic.' + uuid.uuid4().hex
            account = 'dummy-only-not-a-real-key'
            assert service != reader.SERVICE and account != reader.ACCOUNT
            payload = b'sk-proj-' + b'D' * (size - 8)
            item = c.c_void_p(); removed = False
            try:
                status = sec.SecKeychainAddGenericPassword(ref, len(service), service.encode(),
                    len(account), account.encode(), len(payload), payload, c.byref(item))
                if status != 0:
                    raise RuntimeError('Dummy item creation was denied; no production item touched.')
                with patch.object(reader, 'SERVICE', service), patch.object(reader, 'ACCOUNT', account):
                    secret = reader.read_project_key(allow_prompt=False)
                matched = secret.authorization() == 'Bearer ' + payload.decode()
                del secret
                if not matched:
                    raise RuntimeError('Dummy bridge round trip differed.')
                replacement = b'sk-proj-' + b'R' * (size - 8)
                with patch.object(entry.setup, 'SERVICE', service), patch.object(entry.setup, 'ACCOUNT', account):
                    entry.native_store(replacement, login_keychain(), replace=True, allow_prompt=False)
                with patch.object(reader, 'SERVICE', service), patch.object(reader, 'ACCOUNT', account):
                    secret = reader.read_project_key(allow_prompt=False)
                if secret.authorization() != 'Bearer ' + replacement.decode():
                    raise RuntimeError('Dummy replacement round trip differed.')
                del secret
                cases.append({'dummy_bytes': size, 'native_round_trip_exact': True, 'replacement_round_trip_exact': True})
            finally:
                if item:
                    removed = sec.SecKeychainItemDelete(item) == 0
                    cf.CFRelease(item)
                if not removed:
                    raise RuntimeError('Dummy cleanup unconfirmed; stop and review.')
                status = sec.SecKeychainFindGenericPassword(ref, len(service), service.encode(),
                    len(account), account.encode(), None, None, None)
                if status != -25300:
                    raise RuntimeError('Dummy absence not confirmed; stop and review.')
        service = 'com.lemonlavender.training-center.dummy-diagnostic.' + uuid.uuid4().hex
        account = 'dummy-only-new-restricted-entry'
        item = c.c_void_p()
        try:
            with patch.object(entry.setup, 'SERVICE', service), patch.object(entry.setup, 'ACCOUNT', account):
                entry.native_store(b'sk-proj-' + b'D' * 156, login_keychain(), replace=False, allow_prompt=False)
            # Metadata lookup only. New entry has no trusted application access.
            out = c.cast(c.byref(item), c.c_void_p)
            status = sec.SecKeychainFindGenericPassword(ref, len(service), service.encode(),
                len(account), account.encode(), None, None, out)
            if status != 0 or not item:
                raise RuntimeError('New dummy entry metadata was not confirmed.')
            cases.append({'dummy_bytes': 164, 'new_restricted_entry_created': True,
                          'new_entry_password_not_retrieved': True})
        finally:
            if item:
                if sec.SecKeychainItemDelete(item) != 0:
                    raise RuntimeError('New dummy cleanup was not confirmed.')
                cf.CFRelease(item)
            status = sec.SecKeychainFindGenericPassword(ref, len(service), service.encode(),
                len(account), account.encode(), None, None, None)
            if status != -25300:
                raise RuntimeError('New dummy absence was not confirmed.')
    finally:
        if ref: cf.CFRelease(ref)
        sec.SecKeychainSetUserInteractionAllowed(previous.value)
    report = {'cases': cases, 'dummy_items_deleted_and_absence_confirmed': True,
        'production_item_read_or_changed': False, 'clipboard_accessed': False, 'api_requests': 0}
    (Path(__file__).resolve().parent.parent / 'artifacts' / 'credential-native-dummy-diagnosis.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2)); return 0


if __name__ == '__main__':
    try: raise SystemExit(main())
    except Exception:
        print('Dummy-only native diagnostic did not complete. No API call or production-item retrieval was attempted.')
        raise SystemExit(1)
