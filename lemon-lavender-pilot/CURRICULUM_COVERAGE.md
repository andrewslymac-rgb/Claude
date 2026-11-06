> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# Curriculum and reliability audit — completed local pass

Seven lessons / 21 guided steps remain the primary learning path. There is still one Continue action. New, unstarted lesson snapshots use `guided-foundations-2026-10-07-v2`; existing snapshots, answers, completion credit and attempts retain their original content. Each step has an objective, explanation, three instructions, realistic original example, common mistake, escalation boundary, explained knowledge check and next-step navigation. Six steps now collect the learner's own writing for trainer review.

| Job area | Working local instruction and practice | Still incomplete or decision-dependent |
| --- | --- | --- |
| Company / Portland orientation for a Philippines VA | Mission, values, owner/trainer roles, residential context, square feet/USD, address read-back, local geography as context, Pacific/Manila dates and seasonal offsets; introduction rehearsal and checks. | Current coverage eligibility needs owner confirmation. Place names are not a promised service area. |
| Services and pricing | Standalone/initial deep, move, weekly/biweekly/monthly; mandatory deep/reset; extras, minima, formula and walkthrough boundary. Added worked 2,750 sq ft deep + oven = $825 and 500 sq ft minimum = $325. | Detailed service checklist, window/freezer units and recurring extras frequency remain unresolved. |
| Inbound discovery and response timing | Guided Taylor call, priority discovery, relevant value, clear first/recurring prices; immediate live answering, five-minute outreach and next-opening 08:05 checks. | One scripted full-call scenario; no live adaptive voice, listening or interruption handling. |
| Outbound follow-up | Original follow-up/voicemail writing rehearsal; working business-day simulation, after-hours deadline, preferences, invalid-email skips, replies, callbacks, opt-out, final-message rehearsal/archive. | No real outreach or scheduled reminders. Holidays and final-message channels need a decision. |
| Typical objections | Price surprise, cheaper competitor, partner/need-to-think, timing pressure, interruptions, deep refusal; examples, decisions and own-words rehearsal. | No separate adaptive spoken objection scenario. Discount authority remains unapproved. |
| Complaints and escalation | Acknowledgment, fact-finding, requested remedy, factual manager handoff and cancellation boundary; complaint writing rehearsal and checks. | Refund/re-clean authority, cancellation fee/waiver and escalation contacts/response commitments are unapproved. No full adaptive complaint call. |
| Appropriate closing | Explicit service-request proposal, saved accurate quote and observed customer commitment checked separately; valid non-fit/escalation accepted through manager review. | Does not perform or infer formal quote approval, payment, deposit or booking. Numeric rubric/pass rules need approval. |
| CRM handoff and coaching | Generic practice notes, exact next-step distinction, written handoff rehearsal; learner/trainer evidence links, private optional audio, one-behavior review and readiness observations. | Exact Jobber form is still blocked by public security verification; no Jobber connection. Written/audio quality requires human review. |

## Substantive changes

The previous guided orientation omitted useful detail already present in the older welcome reference; the new version restores Portland/Philippines working context and provides two date-specific conversion examples verified with `zoneinfo`. The pricing lesson now teaches a complete calculation, rounding and the minimum instead of relying only on fixed 2,000 sq ft examples. Objection, follow-up and complaint skills now have original written rehearsals in addition to their explained decision checks. Trainer pages now display those saved responses, their draft/completion state and direct lesson links; before this pass, the trainer preview did not show the actual writing.

No new company policy was inferred. The existing owner decisions and supplied readiness-kit review remain the source boundaries. Founding/coverage claims awaiting approval were not elevated into promises. The existing customer voice files remain prerecorded and unchanged in this pass.

## Reliability fixes verified

- **Recording acknowledgment:** a sign-in redirect previously ended in HTTP 200 and could falsely clear a preview. The client now requires an explicit JSON save confirmation and recording ID. Actual logout → attempted save → re-login in a second tab → retry worked in Chrome, including the rotated CSRF cookie.
- **Retry and interruption:** timeout, storage failure, malformed success, or missing prior file no longer count as success. A lost acknowledgment after the server saved can be retried without making a second clip. An unsaved preview must be explicitly saved/discarded before starting another recording. Stop releases microphone tracks; persisted-page lifecycle resets controls. Unsaved audio is not durable across closing the tab/browser.
- **Private recording access:** owner and invited trainer/admin reads, learner-only writes, revoked/no-profile/cross-learner denial, CSRF, canonical WAV validation, duration/size/count bounds and non-static storage were tested. A missing profile previously caused an error while decorating a denied attempt response; it now returns the intended denial. No permission scope, OS/browser settings, camera/display policy or external access was changed.
- **Stale lessons:** conflict responses retain the unsaved text and show newer saved evidence rather than redirecting away and losing it. A version token prevents an already-open older lesson from being graded as new material. Completed/snapshotted evidence remains unchanged.
- **Other drafts:** invalid trainer feedback and callback fields retain the user's writing. Stale CRM notes survive as a reviewable draft, including after submission; stale callbacks after opt-out remain visible without restarting outreach. Existing evidence is not overwritten by these conflict responses.

## Validation and preservation

148 automated tests passed; Django system checks and migration drift check passed. Full installed-Chrome QA completed all 21 steps, six writing rehearsals, browser Back/Forward, stale-draft recovery, synthetic recording, denied permission, failed save, expired sign-in, timeout, lost acknowledgment, reload, discard, trainer playback/review and retry. A separate browser pass exercised the after-hours follow-up workflow, invalid callback retention, valid callback and opt-out, plus trainer reading of the rehearsals. Detailed evidence: `artifacts/reliability-test-results.txt`, `artifacts/reliability-browser-results.json`, `artifacts/followup-reliability-browser-results.json`.

Browser recording QA used Chrome's synthetic microphone only. No physical microphone was invoked, no real person's voice captured, and no perceived-human-quality claim is made. Live transcription/audio grading remains disconnected.

All non-authentication training tables and all 33 pre-existing WAV assets match the private pre-pass backup. Original sign-in records are also unchanged; the running-server browser check added three consumed mock sign-in audit rows. No stored learning evidence was reset, no new migration was needed, no dependency was added, and no estimator, paid service, credentials, customer upload, real email or deployment was touched. The loopback pilot remains on the MacBook Pro at http://127.0.0.1:8765.

Further progress on live adaptive calls/audio grading requires an approved provider and bounded test spend. The remaining business-policy decisions listed in the matrix need Andrew; adding more generic text would not resolve them. The local instructional and reliability pass has no remaining implementation blocker.
