> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# Parent handoff — voice test ready, October 8

**Morning next step: a ready-to-run owner-operated voice-quality test. There is no remaining configuration or fresh-approval blocker for the reviewed policy refresh.** Nothing was started or spent during this review.

Andrew can double-click [start-voice-quality-test.command](start-voice-quality-test.command), then open **http://127.0.0.1:8769/voice-quality-test/**, use the existing local learner preview sign-in, accept the fictional-audio notice, perform the local microphone check, and deliberately press Start. Only that Start connects to OpenAI. The owner handles any existing macOS/browser permission prompt personally. The normal app on 8765 remains provider-off. No credentials or permissions were inspected or changed in this review.

The same unused authorization remains **one start, five minutes reserved, four minutes active, $1 maximum total including one bounded transcript-coaching request**. No automatic retry, paid delegation or additional test was authorized. The original $2 test and earlier microphone grant remain closed.

## Exact configuration issue and resolution

The grant stored fingerprint `3f6d8b448fd43c10b466ff4ec179d2b2733bca18b53b5c1897240cf4ab377361`. Owner-approved policy updates produced `6e719a9cf85518f325bde3c0c687eab09edea6a0ad0697853152713784a5f642`, so the original exact-match check correctly blocked launch.

The original configuration was reconstructed from the preserved v2 prompt export and matched its hash exactly. Comparison verified that **only instructions changed**: policy/scenario/prompt versions, residential home → single-family home, a paid-deposit win definition, Andrew's approved value/tone/follow-up/discount/promotion rules, and which policy details still require confirmation. The actual caller's first-deep objection is unchanged. GPT-Live model, Marin voice, PCM format/rate, `store:false`, client-only delegation, fixed busy-parent/intermediate/full choice, assignment, recipient/provider, processing purpose and every budget/time/coaching bound remain unchanged. The coaching model also remains `gpt-4.1-mini` with the same bounds.

Andrew had already approved those facts and the parent explicitly requested a safe in-scope refresh. A single reviewed old→new fingerprint transition is now recorded in [quality_configuration_review.py](training/quality_configuration_review.py). It is bound to the original approval, assignment and SHA-256 of the entire original authorization scope. It does not accept arbitrary current prompts; future changes, scope tampering, used starts and closed grants still fail. **The actual grant file was not rewritten: its bytes, modification time, original fingerprint and complete history are preserved.** This is an explicit configuration review within the existing authorization, not a new allowance or general relaxation of the guard.

`serve_voice_quality_test --check` is now a genuinely read-only preflight: it does not arm a controller/budget, create a lock file, rewrite a ledger, access credentials or start a server. It passed against the real unused grant while credential/transport/arming calls were patched to fail if reached. The dedicated assignment has no attempts; port 8769 is stopped until Andrew launches it.

Evidence: [exact comparison](artifacts/quality-configuration-review/comparison.json), [readiness result](artifacts/quality-configuration-review/readiness.json), [36 focused tests](artifacts/quality-configuration-review/tests.txt), [390 full regression tests](artifacts/quality-configuration-review/full-tests.txt). Original and refreshed configurations plus the unmodified original grant are archived in that local evidence directory. All 17 training tables' original values, recordings and historical ledgers still pass the [preservation comparison](artifacts/audit-preservation.json).

## Highest-severity verified audit repairs

- Requests/proposals/verbal agreement no longer count as wins. A qualified full rehearsal needs a separate, explicit trainer-authored **simulated paid deposit** record.
- Concurrent lesson saves now preserve one saved revision and return a recoverable stale-draft response instead of a server error. Call finalization retains newer handoff evidence saved while coaching finishes.
- Corrupt recordings cannot be falsely acknowledged or played; local symlinks are refused. Missing initial audio capture cannot masquerade as a complete recording.
- Customer/CRM-only citations cannot credit learner behavior. AI/regex policy flags remain provisional, with an explicit manager resolution path. Readiness requires objection evidence, and legitimate live escalations can be manager-verified without fabricating a win.

## Remaining boundaries

The owner voice test still needs to establish human conversation quality, interruption behavior, audio/device reliability and listening usefulness. Read-only preflight cannot verify current credential availability or provider service. No new provider request, real microphone use or credential inspection was performed.

The app remains a local fictional pilot, not production invite-only identity. One-on-one operational authority, deposit terms, verified campaign dates/eligibility/terms, rubric weights/thresholds/critical-failure policy, trainee baseline and daily duration remain open. They do not block this already-approved fictional quality test. Promotions are not fabricated; the current verified catalog is empty.

The broad audit/build is finished; no new broad audit was opened for this follow-up. The parent can remind Andrew to lower the reasoning setting if desired.
