> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# Local OpenAI credential storage — corrected October 7, 2026

Read [CREDENTIAL_TERMINAL_REPAIR.md](CREDENTIAL_TERMINAL_REPAIR.md) for the current ready-to-use repair and next step. Andrew already approved replacement; no repeat approval or new key creation is needed. The original native `security -w` prompt truncated long values at 128 bytes; the intermediate Python-getpass path mishandled empty input and retained a canonical terminal limit. Both paths are superseded.

Andrew's saved item has not been read or changed during this diagnosis. No clipboard inspection or API request occurred. Andrew's existing combined $2 / ten-minute synthetic-test approval remains unchanged and unused.

## Corrected entry

`configure-openai.command` creates a missing Training Center item only and refuses to overwrite an existing item. The short-lived helper uses bounded hidden noncanonical terminal input, validates two matching complete entries, and writes directly through Apple's Security framework. An empty line keeps the prompt open. Terminal paste framing is parsed separately from credential data. Piped/redirected input, secret command arguments and echo fallback are rejected.

The complete value exists in the helper process and native memory while saving. It is never written to source, a project file, an environment variable, logs, subprocess arguments, the database or the browser. No API call is made. This is not a claim of zero memory copies or protection from a compromised Mac.

The explicit local range is 20–8,192 ASCII bytes, with the existing `sk-` prefix check, including `sk-proj-` values. The minimum catches obviously short input; the maximum bounds memory/header size. Neither is an OpenAI-published key-length rule. Oversized input, credential whitespace/control characters and multiline pastes are rejected without truncation or guessing. Local validation does not prove validity, permissions or funding.

## Existing-item replacement

Andrew explicitly approved replacement. He can reopen `replace-openai-key.command`, type `REPLACE TRAINING KEY`, and enter the complete issued key twice at the repaired hidden prompts. The helper never reads the old password. It modifies only password data on the exact existing item, preserving metadata and access controls. It does not delete the item, revoke or create a provider key, grant broader access, purchase anything or make a paid request.

Do not run replacement automatically. If Andrew does not have the complete issued value privately, ask him to create a new key himself in the same Training Center project; never request that he send it in chat or a screenshot. See CREDENTIAL_REPAIR.md for the concrete user steps and approval boundary.

## Storage identifiers and access

- Service: `com.lemonlavender.training-center.openai`
- Account: `training-center-project-api-key`
- Label: `Lemon & Lavender Training Center - OpenAI API`
- Location: the verified current-user login Keychain, outside this project.

New-item creation supplies an explicitly empty trusted-application list, matching the former `-T ''` policy. There is no all-app grant or persistent access approval performed by the agent. Replacement preserves the existing access list. Andrew handles native macOS prompts personally; choose a one-time Allow rather than Always Allow when appropriate.

The live server reader uses native Security.framework and keeps the credential in server memory. It does not use shell password retrieval and has no plaintext/environment fallback. Real-key diagnostics must be performed by Andrew through the approved launcher; share only its fixed error code, never the value. Native reader failures, key format failures and cleanup failures have separate sanitized codes.

## Presence-only check

`.venv/bin/python -B scripts/configure_openai_keychain.py --status`

This reads only attributes of the exact dedicated item. It never asks for password data. Presence does not establish complete data or API access. The actual item was previously confirmed present; do not create a duplicate to work around a format error.

## Verification

216 automated tests and 17 complete private-terminal entry cases pass. Native dummy round trips/replacements were exact through 8,192 bytes. Full-flow tests covered delayed confirmation newline, blank Return recovery, CRLF, framed paste, limits, cancellation, no secret echo and terminal restoration. Temporary dummy items were removed; the real item and clipboard were untouched.

Artifacts: `credential-repair-tests.txt`, `credential-native-dummy-diagnosis.json`, `credential-dummy-prompt-diagnosis.json`, and `credential-python-prompt-diagnosis.json` in `artifacts/`. The earlier `credential-setup-results.json` documents the short-dummy/presence-only test that missed truncation; it is historical evidence, not sufficient proof of full-key storage.

Ordinary training remains provider-off. No paid call starts merely by saving a key or launching the bounded test server. Runtime provider tests remain pending the user-approved credential repair.
