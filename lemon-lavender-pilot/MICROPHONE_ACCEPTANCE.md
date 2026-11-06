> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

## Latest: combined playback and visual polish complete

The app now has one full-call review player, refreshed learner/manager screens, clearer navigation and mobile layouts. Andrew’s saved microphone call and real transcript coaching are available; its combined alignment is explicitly approximate because that recording predates shared-clock capture. Future shared-clock recording is mock-tested. **267 tests pass**, full browser flows pass, and original data/audio/authorization history are preserved. No new paid call ran in this pass. Both local ports run provider-off servers.

Current handoff, screenshots and delivery limitation: [POLISH_STATUS.md](POLISH_STATUS.md). Audio details: [COMBINED_PLAYBACK.md](COMBINED_PLAYBACK.md). Multi-company workspaces remain [a future design](FUTURE_WORKSPACES.md), not a working feature. Earlier checkpoints below are historical.

# One human microphone acceptance call — ready for user Start

The new mode is implemented and mock-tested. **No real microphone or additional OpenAI call has been started by the agent.** The prior synthetic authorization remains closed with both starts used, 234 provider-reported voice seconds and approximately $0.20 combined estimated cost. Its ledger bytes are unchanged.

## Andrew’s steps on the MacBook Pro

1. Double-click **start-microphone-acceptance.command** in this project. Handle any native Keychain prompt personally and leave Terminal open. Do not create or paste another API key.
2. Open **http://127.0.0.1:8767/microphone-test/** in Chrome. Sign in as **learner@example.invalid**, open the local email preview, and confirm the sign-in link. No real email is sent. The sign-in returns to the microphone test page.
3. Read and check the recording/data notice. Click **Check microphone locally**, allow browser/macOS microphone access if asked, and say a fictional greeting for three seconds. This check stays in the browser, makes no API call, saves no audio, and turns the microphone off when finished. If sound is not detected, fix the device/permission and repeat the free check.
4. When ready, click **Start call — use microphone** yourself. You are the salesperson; Taylor is the AI customer. Wait for the connected status/customer greeting. Discover needs, explain the initial/recurring price, address the objection, save fictional handoff notes during the call, and propose a service request.
5. Click **End call & prepare coaching**. The microphone stops immediately. Wait for the saved report. The one-start paid mode disables itself after finalization; leave this page open to review the separate recordings, transcript and provisional coaching. Control-C in Terminal shuts down the server.

Practice reference: 2,000 square feet, mandatory $570 initial deep, $220 biweekly thereafter. Availability is unconfirmed; a service request is not a booking, payment or approved operational quote. Do not invent deposit/payment/discount authority. Use fictional details only. Headphones can reduce echo if already available; no purchase is required.

## Boundaries of this new approval

The owner approved one new microphone acceptance test at 3:24 PM Pacific on October 7 (parent reference `Sentinel_25454cab39708191b9f55d494f25dc25`). The new maximum is **$1 additional total including voice and transcript coaching, 300 seconds reserved, one start**. The active connection ends within 240 seconds, leaving closure/coaching margin. It also closes after 30 seconds without trainee/customer audio or eight seconds without browser contact. No automatic retry is available.

The new ledger will be `.data/microphone-acceptance-authorization.json`, created only by the human-run launcher. It is separate from the exhausted `.data/live-test-authorization.json`. The old history/cost/reservations are neither reset nor reused. A consumed or uncertain microphone reservation blocks reopening. Closing the launcher also closes the new grant.

The new technical assignment is ID 2, separate from the original learning assignment. It awards no lesson credit or readiness and does not clear the prior synthetic call’s pending manager review.

## Data and permissions

Only a deliberate local Check/Start click requests microphone access. The Check is local only. During the paid call, captured voice and audible background sound stream through the local server to OpenAI. `gpt-live-1`, voice `marin`, provides customer audio and speech transcripts. The separate `gpt-4.1-mini` coach receives spoken transcript text only, not the recording or saved CRM fields. Private WAVs and evidence stay on this Mac for authenticated learner/trainer/admin access. Provider storage is requested off, but provider abuse-monitoring retention may still apply.

Camera and screen capture remain disabled. No real emails, customers, Jobber connection, new owner credentials, account creation or deployment are involved. The existing dedicated Keychain credential has already worked for voice and coaching; Andrew handles native/browser permission prompts personally.

The normal server at http://127.0.0.1:8765 remains provider-off and denies live microphone permission. The microphone server is not started automatically, and the agent will not click Start or activate a physical microphone.

## Verification and honest limits

**245 automated tests pass.** Checks cover separate ledgers and unchanged prior bytes, one-start reservation limits, refusal to reopen a consumed grant, role/consent/mode/check gates, fixed safe sign-in return, no fake readiness or lesson credit, idle/disconnect/active-call cutoffs, and automatic shutdown of paid mode after finalization.

A disposable fake-provider browser rehearsal passed using an oscillator-generated MediaStream, never a physical microphone. It verified consent/permission denial with zero starts, cancellation of a pending permission request, local sound detection and track release, deliberate Start, note saving, immediate Stop, nonsilent captured PCM, fake coaching/report, and inability to start a second call. Screenshots labeled OFFLINE PROTOCOL REHEARSAL are not proof of a human/OpenAI microphone call.

The real user microphone experience, echo, interruptions and naturalness still require this acceptance call. Coaching evaluates discovery, relevant value, pricing/scope, objections, explicit close/next step, and spoken handoff from transcript evidence. **Cadence, speaking speed, pauses, accent, emotion, personality, health and automatic employment/readiness are not scored.** Manager review remains required.

Evidence: `artifacts/microphone-build-tests.txt`, `artifacts/microphone-mock-browser.json`, `artifacts/microphone-readiness.json`, and `artifacts/microphone-normal-provider-off.json`.
