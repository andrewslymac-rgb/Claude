> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# New voice-quality test ready — October 8, 2026

Andrew approved one new fictional microphone call at 01:28 UTC: **one start, up to five minutes and $1 additional total OpenAI voice/backend/coaching**. This is a new separate allowance. The original synthetic and earlier microphone authorizations remain closed and unchanged.

**Prepared, not started.** Zero real provider requests, zero real Keychain reads and no physical microphone activation occurred during preparation. Normal app ports 8765/8767 remain provider-off. The real quality server on 8769 has not been started. Human naturalness, spontaneous interruption and replay agreement remain unaccepted.

## On the MacBook Pro

1. Double-click [start-voice-quality-test.command](start-voice-quality-test.command) in `/Users/macintoshfamily/Documents/Codex/2026-10-06/task/lemon-lavender-pilot`. Handle any native Keychain prompt personally. It reads the existing dedicated credential into server memory; do not paste a key into chat or the browser. Leave this Terminal window open.
2. Open **http://127.0.0.1:8769/voice-quality-test/** in Chrome on that Mac. Sign in as **`learner@example.invalid`**, use the on-page local email-preview link, and confirm sign-in. No actual email or password is needed. The link cannot reach this local app from iOS.
3. Accept the fictional-audio notice, run **Check microphone locally**, then deliberately press **Start call — use microphone**. The local check does not contact OpenAI or save audio. Only Start opens the paid connection. The launcher itself does not start a call or microphone capture.

The caller is fixed to **Taylor / busy household / intermediate**, with a fictional 2,000-square-foot home and biweekly cleaning needs. Approved practice reference: required initial deep $570, then $220 biweekly. Discover needs before quoting. A request is not a booking; do not invent discounts, availability, deposits or payment terms.

## Three acceptance tasks

1. **Natural back-and-forth:** greet, ask about the cleaning need and address the first-visit concern. Notice whether the customer sounds understandable and natural and whether response gaps feel conversational.
2. **One interruption and pause:** interrupt one customer sentence, use **Let me speak**, pause briefly, then **Let customer respond**. Check that queued speech stops and old speech does not reappear. Also note whether speaking alone causes the provider to yield; the button does not prove natural automatic interruption.
3. **Replay what you heard:** press **End call & prepare coaching**, then play the full conversation. Check the interrupted section, pauses and overlap against the actual call. Use trainer-confirmed transcript intervals where available; provider caption timestamps are approximate.

This tests the system, not employee readiness. Report the specific point if speech sounds robotic, recovery is stuck or replay differs. No naturalness or synchronization pass is claimed before Andrew listens.

## Exact limits and review

The active connection stops after **240 seconds (four minutes)**, measured from server call startup. A **300-second voice reservation** leaves room for startup/closure; the active portion is deliberately shorter than the approved five-minute maximum. The server also retains its existing idle and lost-browser cutoffs. Holding customer playback does not pause the connection or billing.

The ledger reserves **100 cents once**, covering voice and one bounded transcript-coaching request. Paid in-session backend delegation/tools are disabled. Coaching remains text only, `store:false`, at most 48,000 encoded request bytes and 2,400 output tokens. No automatic retry or second start is possible. Final usage and estimated costs are retained; invoice reconciliation is separate.

After ending, the page opens the saved report. Returning to `/voice-quality-test/` takes you to that same attempt instead of another Start screen. Trainers can use `trainer@example.invalid` on the same server and the saved `/live/<attempt-id>/` link. Saved audio/transcript/coaching remains reviewable through the normal app at port 8765 after the test server stops. No exact live attempt URL exists until Andrew starts.

Keep Terminal open while using the call and while evidence/coaching saves. Control-C disables the test process and closes this grant even if unused. If launch fails, retain its fixed error code and ask for diagnosis; do not delete/recreate the ledger or use an old test launcher. Real native credential access is intentionally left to Andrew's launcher run.

## Verification and audit

- [343 automated tests](artifacts/quality-acceptance-tests.txt); [10 new acceptance tests](artifacts/quality-acceptance-targeted-tests.txt). Covers separate histories, one-start limits, scope/configuration tampering, over-duration/uncertain usage, one coaching request, fixed caller, safe sign-in, double-click start, review redirect, busy-port refusal before Keychain, native denial and no connection during launcher setup.
- [Actual launcher + full offline browser flow](artifacts/quality-acceptance-browser.json), using a fake credential, fake provider and generated input only. The actual transport configuration matched the prepared fingerprint. One fake start consumed its disposable reservation and disabled further starts; actual rendered replay, interruption and transcript seeking passed local checks.
- [Normal app remains provider-off](artifacts/quality-acceptance-normal-provider-off.json). Prepared test page has the correct caller and disabled capture/paid controls; the primary six-lesson course is unchanged.
- [Preservation evidence](artifacts/quality-acceptance-preservation.json): all original training rows and 46 tracked audio/evidence/authorization files retained. Only a new technical course/assignment and separate grant were added; no main practice attempt or paid usage row was created by setup. Local preview sign-in adds its normal authentication audit row.
- Approval: `andrew-voice-quality-2026-10-08T01:28Z`; proposal reference `Sentinel_66e57d21a4888191a91a6d526b42c00c`; owner’s “Yes” reference `Sentinel_f7fcc94edbf881919639bf2da17cb618`.
- Private new ledger: `.data/voice-quality-2026-10-08-authorization.json` (0600). It records one start, $1, 300 reserved / 240 active seconds, assignment/caller, prompt-configuration hash, prior-ledger hashes and approval provenance. It contains no key. It is prepared with an empty call ledger.
- Backup before preparation: `.data/before-quality-acceptance.sqlite3`. New launcher is executable; Django checks, migration drift and zsh syntax checks pass. No new dependency or migration is required.

No real key was read, changed or replaced; no persistent owner credential, remote deployment, real email or customer upload was created. No automatic approval-review rejection occurred during this preparation.
