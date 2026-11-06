> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

## Latest — separately approved voice-quality test prepared

Andrew approved one new user-operated call on October 8 at 01:28 UTC: one start, at most $1 additional including coaching, 300 seconds reserved / 240 active. The new grant is prepared and unused; both earlier grants remain closed. **343 tests and the full mock browser flow pass. No real call or physical microphone was started.** [Mac launcher, exact URL and three acceptance tasks](VOICE_QUALITY_TEST_READY.md). Earlier proposals and checkpoints below are preserved as history.

---

# Current acceptance procedure — October 8, 2026

Local interruption controls, actual render-capture integrity and trainer transcript seeking are implemented and offline tested. See [VOICE_REVIEW_STATUS.md](VOICE_REVIEW_STATUS.md). The earlier inspection below is preserved as history; statements there about missing controls describe the earlier implementation.

**No new paid authorization, provider call or physical microphone test has been created.** Both earlier grants remain closed. This procedure proposes a separate human acceptance test; it does not resume the original $2 / ten-minute grant.

## Smallest useful next test

1. Listen locally first. Andrew/trainer plays the original customer track from the saved human call and separately identifies the Mac-generated trainee in the scripted test. Note the exact excerpt and whether the issue is phrasing, prosody, speed, gaps, distortion or overlap. Keep originals intact. Local signal checks are not a substitute for this listening.
2. Only if separately approved, prepare one start, **120 seconds active / at most 180 voice seconds reserved / $1 total maximum including optional transcript coaching**, no automatic retry. Bind the allowed caller/difficulty and microphone assignment before enabling Start. The existing 240-second launcher must be shortened and its cap tested before this proposed grant can be armed. Do not reopen either historical grant or change credentials.
3. Use `gpt-live-1` / `marin`, one `busy_parent` / `intermediate` full conversation with fictional 2,000-square-foot biweekly needs. Preview the saved prompt/policy/rubric versions. Keep hints outside the customer voice. Andrew personally allows the microphone and deliberately starts after the free local sound check.
4. In about two minutes: greet; ask three short discovery questions with a natural pause; explain the required $570 initial deep and $220 biweekly estimate; address the first-visit objection; deliberately speak during one customer sentence and use “Let me speak”; then explicitly allow recovery. End with a truthful service request or an unresolved-policy handoff, never a confirmed booking. End the call deliberately. No real address, customer details, payment or access secrets.
5. Review the actual browser recording, original tracks, transcript, control events and final usage. A trainer marks at least three spoken transcript intervals, including the interruption area, and tests seeking. Keep any failed evidence and disable further starts. Do not convert this short system test into a trainee readiness decision.

## Proposed system acceptance criteria

| Area | Accept for this narrow test only when… |
| --- | --- |
| Naturalness and intelligibility | Andrew finds the customer useful to practice with, rates each at least 4/5, and hears no recurring robotic cadence, dropped syllables or distracting gaps. Record a specific excerpt for every concern. These ratings assess the system, never the trainee. |
| Response latency | At least three ordinary, non-overlapped exchanges feel conversational. Suggested diagnostic targets: median response gap ≤1.5 seconds, no unexplained gap >3 seconds. A trainer marks end-of-trainee and first audible customer sound on the render recording; report each gap and uncertainty. Exclude intentional pauses/interruption recovery. No learner pace score, percentile reliability claim or model/network-delay deduction. |
| Interruption and recovery | Current and queued sound stop promptly when held (proposed rendered-audio target ≤150 ms from the local control marker), old queued speech never resurfaces, learner capture continues, and explicit recovery gives a relevant short response without replaying the discarded phrase. Also record whether ordinary speech alone causes natural provider yielding; the new button does not prove automatic interruption. A stuck hold or stale resumed speech fails this test. |
| Replay and seeking | Render evidence is complete, continuous and agrees with what Andrew heard around the interruption. No duplicate/missing audio. All three trainer anchors seek to the intended spoken interval with confidence recorded. Legacy recordings remain separate. Hardware output latency remains unmeasured. |
| Persona and sales boundaries | Customer stays in role, raises the configured concern and does not agree before relevant discovery, truthful pricing, an addressed concern and explicit next-step request. No teaching/hints, false booking, payment claim or invented policy. |
| Coaching evidence | Every displayed citation resolves; trainer verifies claims against audible speech, including whether customer words were actually played. Missing/uncertain evidence stays uncertain. CRM actions are checked locally and remain distinct from verbal agreement. No automatic readiness. |
| Cost and history | Exactly one allowed start; active/reservation limits enforced; final voice usage and any coaching token counts retained; both historical grants and recordings unchanged. Unconfirmed usage disables further calls. |

These are proposed acceptance targets, not proven performance or approved sales-rubric thresholds. One short session cannot establish broad reliability. If it fails, identify the failed excerpt/control first; changing voices or calling again requires a separately authorized test scope.

## Expected cost and protocol boundary

At the currently published $0.05/minute, 120 seconds of voice is approximately **$0.10**, or **$0.15** at the full 180-second reservation. Silence/held playback does not pause the connection. Backend work is billed separately; this pilot uses no paid in-session backend. [OpenAI voice pricing](https://developers.openai.com/api/docs/models/gpt-live-1).

Optional transcript coaching uses `gpt-4.1-mini` at $0.40 input / $1.60 output per million tokens. The existing bounded request/output sizes allow a conservative **under $0.03** estimate; roughly **$0.10–$0.18 combined** is the planning range, below the proposed $1 hard reservation. Actual charges need provider usage/invoice reconciliation; this is not a billing guarantee. [OpenAI coaching pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

The app cancels its own queued playback and sends short corrective instructions. Provider input mute does not cancel output; an instruction acknowledgment does not mean playback may resume. The 350 ms signal-quiet gate is an application safeguard, not proof of a completed model turn. [Playback control guidance](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live). Caption timestamps are approximate and output audio has no timing/done event, so manual anchors use the actual rendered recording. [Transcript guidance](https://developers.openai.com/api/docs/guides/live-conversations).

---

# Preserved earlier inspection

# Voice quality: inspected facts and proposed acceptance

No new provider call or physical microphone capture was made for this inspection. The following is a plan, not a new authorization or an acceptance result.

## What the local implementation actually does

- Configured customer: `gpt-live-1`, voice `marin`, 24,000 Hz mono PCM. These are inspected local configuration values; no voice/model substitution was made.
- Human input requests browser echo cancellation and noise suppression. The app requires its tested 24 kHz audio context. The free sound check detects signal; it does not judge pronunciation, intelligibility or naturalness.
- Customer chunks are queued on an AudioContext with a 30 ms scheduling margin. A queue over two seconds closes the call. Events are polled at a 100 ms interval. These are implementation settings, not measured conversational latency guarantees.
- There is currently no explicit per-turn provider interruption/cancellation event path that cancels already queued customer source nodes. Sources stop when the call ends. This is an identified coverage gap; it does **not** establish that Andrew experienced live talkover.
- Future saved conversation capture taps the actual browser render graph and includes stopped source nodes. It was generated-signal/fake-provider tested in the preceding repair. The physical output-device latency is not measured, and there has been no new provider acceptance of that capture path.
- Transcript fragment times and provider/network delays are not valid learner cadence evidence. The app assigns no audio pace/accent/health/personality score.

## Which saved call is which

| Existing call | Input | Customer output | Review limit |
| --- | --- | --- | --- |
| `f05578e6-0f4f-48f6-8c3c-3ff813a46198` | Andrew’s human microphone, fictional practice | Provider customer voice | Original speaker tracks lack a reliable shared render timeline; review separately |
| `eaee3e09-ea2d-459e-a6a5-acb252a0708a` | Prerecorded synthetic trainee speech generated on the Mac | Provider customer voice | This is a scripted technical test, not human voice performance; original tracks also require separate playback |

The earlier local signal inspection found zero clipped samples in both original speaker tracks and zero reported browser playback errors. Older customer tracks use receipt-time gaps, which may affect replay perception. These facts do not determine whether the voice sounds natural. Automated Chrome review was muted, so it was not a listening test. Source evidence: [voice-playback-diagnosis.json](artifacts/voice-playback-diagnosis.json).

## Acceptance sequence

1. **Use existing audio first, with no provider call.** Andrew/trainer listens to the human call’s original customer track and a separate excerpt from the synthetic trainee track, identifying the speaker and approximate point where the sound feels robotic. Record whether the issue is word choice, prosody, gaps, speed, distortion or overlap. Keep original files unchanged. This prevents confusing Mac-generated trainee speech with the provider customer voice.
2. **Resolve the interruption protocol locally.** Check the currently supported official provider interruption/cancellation events before implementing them. Add fake-transport and generated-browser-audio cases for queued playback cancellation, replacement turns, duplicate/out-of-order events, stop during a chunk and incomplete capture. Cancellation must be reflected in the actual render recording. Do not invent an unsupported event name or claim the prompt handles cancellation.
3. **Optional future bounded human test, only after separate approval.** Proposed scope: one fictional prospective-customer call, one start, 120 seconds active with at most 180 seconds reserved, a maximum $1 including any requested transcript coaching, no automatic retry. Use the existing configured voice first so the comparison is interpretable. The current four-minute launcher must not be used unchanged for this proposed shorter limit; implement the explicitly approved limits before arming. Current authorizations stay closed and retain all history.
4. **Test script.** Short greeting and one natural pause; a discovery answer; a specific first-visit objection; one deliberate mid-customer interruption; a price correction/readback; an explicit request or legitimate manager clarification. End deliberately. Use no real customer information, address, payment or access secrets.
5. **Review the evidence together.** Compare the actual rendered recording with what the human heard. Annotate the interruption point and any overlap, missing or duplicated speech. Check that the customer remained in role, did not coach, did not agree before its requirements, and did not invent policy or a booking. Save ratings/comments about the *system’s* naturalness and clarity, not the learner’s identity or employment suitability.

Suggested engineering acceptance: no duplicated/missing chunks or misleading replay; complete render evidence; prompt resistance observed; interruption cancellation behaves as designed; Andrew finds the customer voice natural and intelligible enough for useful practice. These are proposed acceptance criteria, not an approved numerical trainee rubric. One short call would still not establish broad reliability.

If the sound is still unsatisfactory, document the specific failure first. Compare a changed voice or audio configuration only under its own approved remaining limit with the same fictional script. Do not assume longer prompts or more personas cure audio quality.
