> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# Credential entry repair — October 7, 2026

**Later correction:** Andrew approved replacement and encountered an empty/length first-prompt failure. The full Terminal flow is now repaired and tested; see [CREDENTIAL_TERMINAL_REPAIR.md](CREDENTIAL_TERMINAL_REPAIR.md). No repeat approval or new key creation is needed. This document's Python-getpass implementation and 1,024-byte limit are historical; the current hidden terminal handles 20–8,192 bytes. The original saved credential remains unchanged.

**Verified bug:** the original setup delegated hidden entry to `/usr/bin/security ... -w`, which uses native `getpass`. On this Mac, a 164-byte dummy key was truncated to **128 bytes** with LF, CR and CRLF submission. This is an entry-path defect, not evidence that Andrew pasted incorrectly. The earlier native setup test used a short dummy and checked only presence; it did not catch truncation. Apple's [Security Tool source](https://raw.githubusercontent.com/apple-oss-distributions/Security/main/SecurityTool/macOS/keychain_add.c) confirms the hidden prompt uses `getpass`; the installed behavior was verified locally with synthetic input.

The separate native reader successfully round-tripped 51-, 164- and 1,024-byte dummy values exactly. It already accepted `sk-proj-` and other `sk-` prefixes. A terminal Return is not inherently a stored trailing newline: the corrected prompt preserved the complete dummy with LF, CR and CRLF. Literal outer spaces and bracketed-paste control sequences remain invalid and are rejected rather than silently stripped.

Andrew's reported `saved_key_format_invalid` does **not** establish the exact contents of the saved item. Truncation alone would still satisfy the old loose length check, so there may be another formatting issue. The agent did not read, inspect, extract, display, modify, delete or replace the real credential, and did not access the clipboard. No paid request was made to diagnose it.

## What changed

- `configure-openai.command` now delegates to a short-lived hidden-entry helper using Python `getpass`, followed by native Security.framework storage. It does not use the truncating native CLI prompt.
- Two matching, valid entries are required. The full value exists only in helper/native memory; it is never a subprocess argument, environment variable, log, source file, browser response or API request. No whitespace, quotes or control sequences are silently repaired. The previous 20–1,024-byte bound is unchanged.
- New items use an explicitly empty trusted-application list, preserving the original no-automatic-access policy. Existing items are not overwritten by ordinary setup.
- `replace-openai-key.command` is a separate, user-run repair action. It requires the exact typed confirmation `REPLACE TRAINING KEY` before prompting for hidden input. It changes only the matching item's password data, preserving its service, account, label and existing access controls. It never reads the old password, deletes the item, revokes a provider key, changes provider settings or starts a paid call.
- Reader errors now distinguish native access, encoding, length, prefix, whitespace, control characters and cleanup failures without revealing values or lengths. A cleanup failure no longer masquerades as invalid key format; remaining cleanup still runs. NUL/control bytes are rejected before an Authorization header can be built.

## Concrete next action, pending Andrew's approval

Ask Andrew to approve **replacing only the saved Training Center credential through the corrected local helper**. This is a credential-change approval, not another API budget approval. No replacement has been performed.

After that approval, Andrew can:

1. Open `replace-openai-key.command` in this project on the MacBook Pro.
2. Type `REPLACE TRAINING KEY` at the ordinary confirmation prompt.
3. Paste the complete issued project key at each of the two hidden prompts, without quotes or spaces. Nothing is displayed. He must handle any macOS prompt personally. Never send the key or a screenshot containing it.
4. After “Saved in your login Keychain with the complete validated value,” open `start-approved-voice-test.command` and handle its native access prompt. It does not start a call automatically. If it fails, share only the fixed error code.

If the complete original issued key is no longer available privately, do not copy a masked dashboard value or guess. Ask Andrew to create a new key himself in the same Training Center project before the replacement; the agent must not create, retrieve or revoke one. This document does not authorize agent credential changes.

The existing **combined $2 / ten-minute synthetic test approval remains unchanged and unused**. Do not initialize or reset the budget ledger, enable ongoing paid mode, or make an API request just to diagnose entry.

## Evidence

- `artifacts/credential-dummy-prompt-diagnosis.json`: installed native prompt returned 128 of 164 dummy bytes.
- `artifacts/credential-python-prompt-diagnosis.json`: corrected hidden prompt retained all 164 bytes with LF, CR and CRLF; echo was disabled.
- `artifacts/credential-native-dummy-diagnosis.json`: exact native read/write replacement at 51, 164 and 1,024 bytes; restricted new-item creation; temporary dummy items deleted and absence confirmed. No production-item access.
- `artifacts/credential-repair-tests.txt`: **210 tests pass**, including 17 new validation/bridge/entry tests. Django checks, migration drift and launcher syntax checks pass.

Training data, existing recordings, approval cap and provider configuration are unchanged. Real provider access, audio quality and coaching remain untested.
