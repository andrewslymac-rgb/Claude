> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# First-prompt repair — October 7, 2026, after 21:09 UTC report

**Ready for Andrew to reopen the same approved `replace-openai-key.command`. No new replacement approval or API key creation is requested.** His replacement approval is already recorded in the parent conversation. Neither the failed first prompt nor this diagnostic changed the existing saved credential. No real secret or clipboard was inspected, and no API request ran.

## Concrete findings

The exact `saved_key_length_invalid` failure was reproduced with dummy data through the full confirmation → first hidden prompt flow. A delayed LF after confirmation, an empty Return, or a leading newline in a paste made Python `getpass` return an empty string. The helper then incorrectly described that empty input as a saved-Keychain length error and exited before the second prompt. The screenshot does not establish which bytes Andrew's prompt received; this is a verified reproducer, not an inspection or diagnosis of his actual secret.

Ordinary synthetic keys of 164, 200 and 512 bytes passed the second helper unchanged. The original native-`getpass` 128-byte truncation was not recurring on those normal Python-prompt inputs. A separate limit was confirmed: this Mac reports a 1,024-byte canonical terminal line limit. The canonical prompt completed at 1,023 bytes but stalled at 1,024 and above. The old application length check also imposed a local 1,024-byte cap.

## Fix

`training/secret_input.py` now owns one hidden, noncanonical terminal across both key entries. It waits after an empty line, handles LF/CRLF and Terminal's exact bracketed-paste framing, and restores terminal modes after success, failure or keyboard cancellation. It never reads the clipboard. Oversized input is rejected at the line boundary without returning or saving a truncated prefix. Literal whitespace, multiline pasted content, malformed controls and mismatched entries do not overwrite the saved item.

The entry helper now reports input problems as input problems, not as a failure of the existing Keychain data. It still validates both matching entries before the one scoped native write. Existing Keychain metadata and access controls remain preserved. No API connectivity test runs while entering a key.

## Exact supported range

Local entry and native reading support **20–8,192 ASCII bytes**, inclusive, with the existing `sk-` prefix and whitespace/control checks. `sk-proj-` and other `sk-` prefixes fit; there is no fixed 51-, 128- or 164-character assumption. The 20-byte minimum is a retained local plausibility guard for obviously short input, not proof that a credential is complete. The 8,192-byte maximum bounds local memory and Authorization-header size. An 8,193-byte entry is rejected without writing anything.

These are **application limits, not published OpenAI key-length rules**. The current [OpenAI authentication documentation](https://developers.openai.com/api/reference/overview#authentication) describes bearer credentials and recommends total request headers below 64 KiB; it does not specify a fixed project-key length. A value passing the local check still needs the separately approved provider test to establish validity and access.

## Verification

- **216 automated tests pass.** Django checks, migration drift and launcher syntax checks pass.
- **17 full-flow private-terminal cases pass** through zsh/CPython and the real entry function with mocked Keychain I/O: 20, 164, 200, 512, 1,023, 1,024, 1,200, 4,096 and 8,192 bytes; over-limit rejection; delayed confirmation LF; leading newline; empty Return recovery; framed paste; multiline rejection; cancellation. No dummy key appeared in terminal output. Echo/canonical modes were restored.
- Actual native dummy-only storage/readback and replacement matched exactly at 51, 164, 1,024 and 8,192 bytes. All temporary dummy items were deleted and absence confirmed. The real Training Center item was never targeted.
- Final targeted checks of 8,192-byte input, framed paste and Ctrl-C cancellation passed after the last terminal-mode adjustment.

Artifacts: `artifacts/credential-full-flow-before.json`, `artifacts/credential-full-flow-after.json`, `artifacts/credential-native-dummy-diagnosis.json`, `artifacts/credential-terminal-repair-tests.txt`.

Testing used private pseudo-terminals with generated input; it did not automate Andrew's actual Terminal window, read his clipboard, or use his key. His exact reported input remains unknown.

## Next user step

Close the finished window and reopen `replace-openai-key.command`. Use the existing confirmation phrase, then paste the complete issued key at each hidden prompt and press Return. If an extra Return arrives, the helper now keeps waiting and says no text has been received yet. There is no need to create another key just to try the repaired input path.

After a confirmed save, Andrew can open `start-approved-voice-test.command` and handle its native access prompt personally. That launcher starts no paid call by itself. The original combined **$2 / ten-minute synthetic test authorization remains unused and unchanged**. Real voice, provider coaching and their usage totals remain untested.
