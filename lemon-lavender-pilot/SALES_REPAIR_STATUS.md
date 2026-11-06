> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# Sales training repair checkpoint — October 8, 2026

The three immediate repairs are implemented and available locally at http://127.0.0.1:8767 (also port 8765). Both servers have paid calling disabled. This checkpoint supersedes earlier claims that approximate combined playback was suitable for older recordings and that seven lessons remain active.

## Written answers: confirmed cause and repair

The old green “That’s the right idea” message checked only the multiple-choice selection. The accompanying writing merely needed 30 characters. A correct choice plus an unrelated sentence therefore received praise. The reproduction is saved in [written-feedback-before.json](artifacts/written-feedback-before.json).

The app now displays multiple-choice results separately from written-response feedback. Each of the four active writing questions has explicit required details and conservative local policy checks. Off-topic or clearly invalid responses receive revision guidance; partial responses identify missing details. Plausible complete prose is always **Pending manager review**, never automatically graded correct. A learner can explicitly refer an uncertain partial answer to a trainer. Clear policy violations cannot use that shortcut.

These are limited local checks, not reliable semantic interpretation. Meaning, naturalness and competence remain human judgments. No paid model is called for this feedback, and learning progress is not readiness approval.

Earlier answers and completion credit remain intact. Revisions archive the preceding response, question snapshot, version and evaluation. Trainers can inspect the history. The additive `0008_written_response_history` migration is applied to the main database; browser testing used disposable data and created no main response-history rows.

## Sales-only curriculum

The existing guided structure now contains **6 active lessons, 18 steps and 4 written rehearsals**. Existing-customer complaint/service-recovery content is retired from active learning and practice navigation. Its saved answers remain accessible as read-only history and do not count toward the active denominator or current readiness evidence. Pre-sale objections and truthful escalation remain.

## Saved audio: confirmed limitation and repair

Older calls have no reliable shared playback timeline. Combining their independently captured tracks could make speakers overlap at the wrong time. The app no longer creates or serves that guessed combined playback, including previously cached mixes. Both original recordings remain intact and visible; playing one pauses the other. Direct requests for the unsupported combined recording return 404.

Future capture records the actual browser-rendered customer audio together with input on one audio clock, including customer playback stopping. A completed capture is required before offering a full-call player. This path passed generated-audio browser tests and a fake-provider end-to-end check; it has **not** had a new paid provider or physical-microphone test.

Robotic voice quality is a separate, unresolved concern. The saved original tracks contain no clipped samples, and the provider browser reported no playback errors. The scripted trainee uses prerecorded Mac speech; the customer is the provider voice. Receipt-time gaps can affect older replay, but neither these measurements nor muted browser QA establish the cause of perceived unnaturalness. Live interruption was not confirmed, and live endpointing/voice settings were not changed.

## Verification and preservation

- [287 automated tests pass](artifacts/sales-writing-tests.txt); Django system and migration checks pass.
- [Browser checks](artifacts/written-feedback-browser.json) cover all four questions with unrelated, partial, policy-violating and plausible answers, trainer review, preserved history and retired content.
- [Legacy playback checks](artifacts/legacy-playback-browser.json) confirm separate originals and one player at a time for both the corrected scripted call and the saved human call.
- [Rendered-audio clock check](artifacts/render-clock-browser.json) confirms actual customer stop and final partial-buffer flush using generated signals; [fake-provider capture](artifacts/microphone-mock-browser.json) also passes.
- [Preservation comparison](artifacts/sales-writing-preservation.json) confirms all 14 preexisting training tables unchanged across the migration and original checked recordings and both authorization ledgers unchanged. No new paid calls occurred in this repair pass.
- [Current main-server smoke check](artifacts/current-main-smoke.json) confirms six active lessons, the saved corrected call, six received coaching observations with resolving citations, separate original tracks, unsupported combined playback returning 404, and paid mode disabled. It used local mock sign-in only; no training answers or reviews were changed. The two disposable QA servers are stopped; the main servers remain running.
- Screenshots: [unrelated writing](artifacts/writing-offtopic-browser.jpg), [partial writing](artifacts/writing-partial-browser.jpg), [pending human review](artifacts/writing-valid-browser.jpg), [trainer view](artifacts/writing-manager-browser.jpg), [separate playback](artifacts/legacy-recording-correction.jpg).

Older `review_guided.py`, `review_followup_reliability.py` and `review_polish.py` browser scripts describe prior seven-lesson/combined-player behavior and need updating before reuse. The current targeted browser evidence above and the full automated suite cover this checkpoint.

## Corrected paid test: already complete

The original corrected fictional-audio test and transcript coaching succeeded: 6 learner turns, 7 customer turns and 6 coaching observations with valid transcript citations. The failed silent-fixture attempt is preserved.

Both original voice starts total **234 seconds (3:54)**; combined estimated voice-plus-coaching cost is **$0.1959664**, approximately $0.20, not an invoice verification. The original **$2 / 600-second** limit and history were preserved. Both fixed start reservations are consumed, zero starts remain, and that authorization is closed. This repair pass did not reopen it or make another provider request. [Original corrected-test evidence](artifacts/corrected-live-provider-verification.json).

Saved corrected call: http://127.0.0.1:8767/live/eaee3e09-ea2d-459e-a6a5-acb252a0708a/. Sign in with the local fictional learner/trainer email preview if needed; no real email is sent. Use the two separate recording players. Coaching remains provisional, with manager review pending.

## Next bounded pass

The larger nine-part sales enhancement request is tracked in [SALES_ENHANCEMENT_BACKLOG.md](SALES_ENHANCEMENT_BACKLOG.md). This repair checkpoint does not claim those additions are complete. Next: extend the existing versioned customer configuration and original content with a small persona/objection set, a draft evidence-based rubric, and local previews/tests. Keep the current guided outline. No additional paid use, deployment, real invitations or credential changes are needed for that local work.
