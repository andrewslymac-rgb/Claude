> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# Historical voice-test checkpoints

These entries precede the first real provider test. Current outcome: [LIVE_VOICE_STATUS.md](LIVE_VOICE_STATUS.md).

## Current checkpoint — same authorization resumed

Native access check after resumption: the existing server command without prompting returned `macos_authorization_denied` and exited before arming or making any API request. The same resumed authorization remains unused and open; Andrew must reopen the existing launcher and personally handle the Keychain prompt. No credential was returned to tool output, changed, or replaced.

Andrew directly requested resumption of the same unused test with its history, combined $2 maximum and 600-second limit preserved. The explicit resume retained the original approval ID and creation timestamp, embedded the complete preceding closed record in an audit event, and kept the empty call ledger. No allowance was replaced or increased. Automatic reopening remains disabled; any existing reservation makes this unused-resume operation unavailable. Evidence: `artifacts/live-authorization-resume.json`.

222 automated tests pass, including history preservation, refusal to replenish used/unconfirmed allowances, duplicate resumption, and outbound-data boundaries. The coaching request now contains only fictional spoken transcript fields alongside fixed fictional scenario instructions; CRM notes, local actions, policy snapshots and account data stay local. The dedicated server is stopped. Andrew has been asked to reopen the existing `start-approved-voice-test.command` and personally handle any native Keychain prompt. No provider request has been made at this checkpoint. The prior automatic-review rejection and credential-repair entries below are historical.

# Bounded voice-test checkpoint — 2026-10-07

**Latest execution checkpoint:** Andrew completed credential replacement and launched the bounded test server personally. Read-only preflight confirmed PID 74846 serving port 8767, an open authorization with zero calls, no LiveCall rows and no paid UsageEntry rows. Running `scripts/review_live.py --provider` was rejected by automatic approval review **before process launch**: it treated the original no-paid-API instruction as trusted and did not accept the later delegated approval as trusted authorization. No browser call, external audio/transcript transfer or API charge was initiated. This is not an OpenAI/runtime failure. Direct trusted approval must be resolved; do not bypass the rejection or reset the ledger. Evidence: `artifacts/live-approval-block.json`.

The dedicated test server was then stopped with SIGINT. Normal launcher cleanup marked the existing authorization `closed:true`, with `calls:{}` unchanged. Port 8767 is no longer listening; paid mode is off. No budget file was deleted or reset. The current launcher intentionally refuses to reopen a closed authorization. Any future continuation must resolve the trusted-approval boundary and explicitly reconcile this zero-spend closed grant while preserving its audit record and the aggregate ceiling.

**Current credential checkpoint:** the approved replacement prompt is repaired and ready to reopen. Empty-line/CRLF handling and the terminal line limit were reproduced and fixed with dummy input; 216 tests and 17 complete terminal cases pass. Supported local range: 20–8,192 bytes. No saved real credential change or paid request occurred. See [CREDENTIAL_TERMINAL_REPAIR.md](CREDENTIAL_TERMINAL_REPAIR.md). No repeat replacement approval or new key creation is requested; earlier approval-needed/Keychain-denial notes below are history.

**Latest credential repair:** Andrew's user-run launcher subsequently reported `saved_key_format_invalid`. Dummy-only investigation found the original native entry prompt truncates a 164-byte value to 128 bytes. The entry method is fixed and 210 tests pass. The real saved credential has not been inspected or changed; the exact stored-data issue remains unknown. Before another live attempt, review [CREDENTIAL_REPAIR.md](CREDENTIAL_REPAIR.md) and obtain Andrew's approval for the prepared user-run replacement. The $2 / ten-minute test approval is unchanged; no API request or paid usage has occurred. Earlier native-denial details below are historical.

The implementation is ready for its first provider test. **No OpenAI API request, paid usage, real microphone capture, or successful live conversation has occurred.** A presence-only check confirmed the dedicated Keychain item exists. The unsandboxed native noninteractive reader returned `macos_authorization_denied` (OSStatus -25293); it did not return a key. Andrew must handle the macOS prompt personally. A restricted-sandbox probe reported missing-item visibility, which was resolved by the independent unsandboxed presence check; do not recreate or overwrite the saved key. All ordinary application starts remain provider-off.

## Immediate next step

Open `start-approved-voice-test.command` on the MacBook Pro. It reads only the dedicated Training Center item using Apple's native Security framework into server memory, with Andrew personally handling any prompt. Choose Allow for this access rather than granting permanent access. Never paste a key into chat, command arguments, environment variables, source, logs or the browser. The launcher binds to `http://127.0.0.1:8767` and does not start a call automatically.

After the server is ready, the agent can run `.venv/bin/python scripts/review_live.py --provider` to sign into the fictional learner, start exactly one synthetic call, save fictional CRM notes, wait for the 112-second offline fixture to finish, replay saved tracks and open trainer review. It forbids `getUserMedia`; it does not use the physical microphone. Keep Terminal open until the test is finished. Control-C closes the authorization and disables paid mode. Do not reopen or delete a closed/unconfirmed authorization ledger to retry; review the result first.

Native Keychain denial is an OS credential-access boundary, not a missing budget approval. Andrew already explicitly approved up to $2 combined / ten minutes at 20:08 UTC. No account, key, persistent access grant, purchase, invitation or deployment is needed from the agent.

## Implemented and verified locally

- Start/stop flow, PCM input relay and customer playback, transcript fragments, notes saved during the call, two private WAV tracks, provisional evidence-linked coaching, manager review and retry. The complete Chrome browser path passed against a fake provider in a disposable database.
- Native server-only credential reader with redacted representation and generic errors. No shell password retrieval, environment fallback, HTTP credential page or browser token. The real key was not retrieved by the agent.
- Persistent, locked authorization file shared across processes: two starts maximum, 100 cents and 300 voice seconds reserved per start, never released for extra retries. This reserves the entire $2 / 600-second cap. No automatic retries. A closed or unconfirmed attempt disables further spending.
- Maximum 240 seconds active connection, 15-second startup/closure cutoffs, 30-second idle cutoff and 8-second missing-browser cutoff. Bounded input/event/audio queues; out-of-order PCM fails, repeated last audio acknowledgement is idempotent. Server-only WebSocket and one separate coaching request; no paid backend delegation/tools.
- Per-attempt policy/scenario/rubric snapshots, actual CRM actions and deterministic pricing/outcome checks remain authoritative. The model cannot create a booking, approve a quote or record a payment. Live spoken commitment requires manager verification; a model's yes never substitutes for the scripted qualification evidence.
- Provisional text coaching references actual transcript IDs; policy allegations require an exact learner quote. No numeric score, unapproved weights, automatic readiness, employment decision or accent/personality/health judgment. No cadence measurement: fragment timing and network/model delays cannot establish learner speaking speed.
- 193 tests pass; Django checks and migration drift checks pass. New migration `0007_live_call` adds a table. All original training rows were retained; the 33 existing WAV assets are not replaced. The estimator was not touched.

## Selected provider configuration; runtime still unverified

Voice: OpenAI `gpt-live-1`, voice `marin`, 24 kHz mono signed PCM, documented WebSocket endpoint `/v1/live/sessions`. Session starts with `store:false` and `delegation:{type:client}`. Local deterministic facts answer delegation; no paid Responses backend is enabled in the voice session. See [WebSocket protocol](https://developers.openai.com/api/docs/guides/voice-websockets), [conversation events](https://developers.openai.com/api/docs/guides/live-conversations), and [client delegation](https://developers.openai.com/api/docs/guides/live-delegation).

Coaching: one `gpt-4.1-mini` Responses request after confirmed voice closure, text only, `store:false`, no tools, maximum 48,000 encoded request bytes and 2,400 output tokens. The provider may reject access/schema/model configuration; that has not yet been tested. An uncertain coaching response disables further paid calls and leaves local manager review available.

Documented voice price checked October 7: $0.05 per active minute, including silence. At 300 reserved seconds, voice is $0.25 per start. Coaching input/output pricing is $0.40 / $1.60 per million tokens; the conservative request bound keeps estimated coaching under $0.03. Actual provider-reported seconds and token counts will be retained separately from price-derived dollar estimates. `reported_cents` remains empty without a provider bill. The app's $50 planning target and Andrew's reported $5 provider hard limit are separate; the latter has not been independently verified. Sources: [voice model/pricing](https://developers.openai.com/api/docs/models/gpt-live-1), [coaching model/pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [active-time costs](https://developers.openai.com/api/docs/guides/voice-latency-cost).

Only fictional audio/transcript/notes go to OpenAI during the approved test. Audio tracks and the evidence journal remain on the Mac. `store:false` requests no provider-stored session/response recording; it is not a zero-retention promise. Standard abuse-monitoring logs may be retained up to 30 days. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

## Evidence and remaining limits

| Check | Status |
| --- | --- |
| Application automated suite | 193 passing; `artifacts/live-test-results.txt` |
| Offline browser start → notes → stop → playback → manager retry | Passed; `artifacts/live-mock-browser.json` |
| Screenshots | `artifacts/live-mock-saved.jpg`, `artifacts/live-mock-manager.jpg`; fake-provider rehearsal only, intended model labels are not proof of connection |
| Original training data | Preserved before any real call; `artifacts/live-preservation.json` |
| Native real-key retrieval | Blocked by macOS; Andrew's prompt needed |
| Real OpenAI session / coaching / measured usage | Not attempted; zero application-originated paid usage |
| Real interruption, latency, naturalness, speech recognition | Untested |
| Physical mic / echo cancellation / human conversation | Untested; no current test page enables it |
| Audio evidence | Separate capture-order trainee and receipt-time customer tracks; not an exact mixed recording of what the browser heard |
| Disconnect behavior | Mock-verified stop and retained WAVs; real network interruptions untested |
| Crash recovery | WAVs survive a handled disconnect; abrupt process death may leave partial evidence/unfinalized usage and blocks automatic retry |

The offline mock uses scripted transcript events and silent customer audio. Its model/pricing labels describe intended configuration, not actual API activity. A follow-up label-only browser rerun was interrupted before starting; the saved screenshots are from the successful first rehearsal.

To complete the approved test, resolve native access, run one fictional call, inspect provider usage and saved evidence, then stop the one-off server and record the outcome here. Do not enable ongoing paid mode. The existing normal server at port 8765 was not restarted during this checkpoint, so it still serves the previous provider-off UI; restart it through `start.command` when ready to load the new disabled-by-default test link.


# Checkpoints superseded by the successful corrected test

## Corrected retry blocked before execution

The corrected retry was submitted to automatic approval review once. Review rejected it before process launch because it treats the parent-forwarded owner approval as untrusted and cannot find explicit trusted-user authorization for the second paid audio/transcript upload in this execution thread. No new provider request, upload, credential access, ledger resumption, or attempt-status change occurred. The authorization remains closed with one finalized 117-second session, estimated cost $0.0975, and the original $1 / 300-second reservation retained.

The retry preparation is implemented and 233 tests pass. It preserves all history/reservations, allows only the final remaining start, and treats the verified silent fixture as a technical failure without creating a manager-readiness decision. The guarded script has not executed. Direct trusted approval for this corrected retry must be resolved here before proceeding; do not ask Andrew to reopen the native launcher yet. Evidence: [approval-review block](artifacts/corrected-retry-approval-block.json), [233-test output](artifacts/corrected-retry-tests.txt).

# Voice test result — October 7, 2026

**Partial result: OpenAI connected and spoke, but the prerecorded trainee fixture was silent. No trainee transcript or AI coaching was produced.** This was a technical test failure, not trainee performance. Paid mode is shut down.

The provider confirmed 117 seconds of voice usage. At the configured $0.05 per minute rate, the estimate is **$0.0975**; a provider invoice was not checked. One voice session was started, with no coaching request, automatic retry, physical microphone, customer data, real email, or deployment.

## What is verified

- The server obtained the dedicated key through Andrew's personal native Keychain flow; the key was not returned to the agent, browser, source, logs, or artifacts.
- A real `gpt-live-1` session accepted the configured client delegation and `store:false`, returned customer audio and seven greeting transcript fragments, and confirmed final usage.
- Fictional notes saved locally, both WAV files replayed, and a trainer could open the evidence and review form. The trainee recording contains silence; it cannot support a performance assessment. The report visibly labels that limitation and AI coaching as unavailable.
- Normal local review is available at http://127.0.0.1:8765 with paid calls disabled. The dedicated paid server on port 8767 and disposable mock server on port 8768 were stopped.

## Local repair and checks

The original installed-voice renderer exited successfully while producing a silent WAV. The repaired render used the already-installed Daniel voice outside the restricted renderer. All six fictional phrases now contain audible samples. The silent original is archived in `.data/live-test-fixture.silent-20261007.wav`; the first test's actual WAVs and evidence were retained unchanged.

The generator now rejects silent phrases and invalid existing fixtures. The paid-server launcher checks all six regions **before Keychain access or authorization arming**. The browser repeats the audio check before requesting a paid start. The browser test now requires nonsilent trainee audio and actual returned coaching; merely displaying the fallback coaching section cannot pass.

**227 automated tests pass.** Django checks and migration checks pass. A fresh disposable offline browser run captured 63,942 active trainee samples, replayed the recording, displayed mock coaching, and saved manager retry feedback. This validates the repair locally; mock coaching is not evidence of an OpenAI coaching response.

## Authorization and preserved data

The original approval ID, creation timestamp, preceding closed ledger, explicit user resume event, and first call remain in `.data/live-test-authorization.json`. The authorization is closed. One start reserved $1 and 300 seconds; those reservations were not refunded or reset. The combined cap remains $2 and 600 seconds. Any continuation must preserve this history and the remaining reservation limit; no new paid call is scheduled or automatically permitted by the launcher.

The 33 original training WAVs are unchanged. Original course, assignment, reviewed attempt, follow-up, review and usage records are preserved. The previous stale active attempt was marked expired through the normal start flow. No estimator files were modified.

## Remaining gap

The repaired fictional speech has not yet been tested against OpenAI. Two-way conversation, learner transcription, and the actual `gpt-4.1-mini` coaching response remain unverified. Human microphone practice, interruptions, real conversational quality and cadence remain untested. Manager readiness was not set.

## Evidence

- [Provider result and usage](artifacts/live-provider-verification.json)
- [Provider browser observations, marked partial](artifacts/live-provider-browser.json)
- [Updated manager report screenshot](artifacts/live-provider-manager-after-verification.jpg)
- [Provider-off report checks](artifacts/live-provider-local-review.json)
- [Repaired offline browser check](artifacts/live-mock-browser.json)
- [227-test output](artifacts/live-fixture-repair-tests.txt)
- [Authorization resume history](artifacts/live-authorization-resume.json)
- [Original training record comparison](artifacts/live-provider-preservation.json)
- [Original audio comparison](artifacts/live-provider-audio-preservation.json)
- [Historical setup checkpoints](LIVE_VOICE_HISTORY.md)
