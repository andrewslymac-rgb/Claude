> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

## Current checkpoint — sales training repairs verified

The current app has **6 active sales lessons / 18 steps / 4 written rehearsals**. Written responses receive question-specific local revision guidance and remain pending human review; multiple-choice correctness no longer praises unassessed writing. Existing-customer complaint content is retired with saved history preserved. Older recordings have **separate speaker playback only** because their timing cannot support a reliable combined call. Future browser-rendered capture, including playback stops, is mock-tested; voice naturalness remains unresolved.

**287 automated tests pass**, along with targeted browser checks. Main data, original recordings and paid authorization histories are preserved. No new paid call was made for these repairs. Both local ports (8765 and 8767) run with paid calling disabled. The earlier corrected fictional OpenAI test and transcript coaching already succeeded within the original cap: 234 total voice seconds, approximately $0.20 estimated combined cost; its authorization is closed.

Current evidence, screenshots and limitations: [SALES_REPAIR_STATUS.md](SALES_REPAIR_STATUS.md). Further requested work: [SALES_ENHANCEMENT_BACKLOG.md](SALES_ENHANCEMENT_BACKLOG.md). Earlier sections below are historical and do not override this checkpoint.

---

# Local product polish and combined playback — complete

Open the app at http://127.0.0.1:8765/. The existing review address on port 8767 also runs the updated app, with paid calling disabled. These independent local processes may require signing in again when switching ports. Use the local demo links; no email is sent.

**Latest call:** http://127.0.0.1:8767/live/f05578e6-0f4f-48f6-8c3c-3ff813a46198/

## What changed

- Consistent plum, lavender and warm neutral styling, refreshed typography, spacing, cards, forms and buttons. No external font, UI framework or new dependency.
- Clear active navigation and responsive phone layouts. Keyboard focus, Skip to content, contrast checks and reduced-motion support.
- A focused learning path with one Continue action; teaching content and existing credit preserved. Demo account buttons fill the sign-in form without bypassing confirmation.
- A manager desk with real review counts, newest submissions first, course progress and assignment controls. Technical microphone acceptance does not masquerade as a seven-lesson course.
- A saved-voice section in Practice makes the learner's microphone recording discoverable alongside the earlier synthetic calls. Other learners' recordings remain private.
- One main full-call player, seek support, originals under a disclosure, and exclusive playback. Coaching observations link directly to transcript entries and open their folded transcript automatically.
- Shorter learner-facing copy; repeated setup details and scoring caveats moved into disclosures. Essential recording/provider/privacy/cost notices remain before call consent. The local-demo and provider-off limits remain honest.
- Visible form-saving state with duplicate-submit suppression, recovery after failed navigation, and preserved named button actions. Existing bound validation errors, unsaved drafts and saved feedback remain functional.

## Verification

**267 tests pass.** Django system checks pass and no migration is needed.

- Nineteen focused audio tests cover unequal lengths, offsets, overlap, gaps, clipping, different sample rates, missing tracks, repeated generation, partial timing, source preservation, permissions, ranges and seeking support.
- A disposable browser mock verifies new shared-clock capture and combined output from generated audio, without a physical microphone or paid provider.
- The full disposable browser flow completes 21 lesson steps, saves/resumes drafts, handles conflicting edits, records generated audio, tests failed/lost-ack saves, submits practice, receives trainer coaching, saves readiness evidence and retries.
- Follow-up browser QA verifies invalid forms, callback notes, stopping outreach, and trainer access to written rehearsals.
- Read-only browser QA checks the real saved microphone call as learner and trainer: playback advances, seeks to approximately 31.5 seconds, pauses the other player, and returns valid byte ranges. Evidence links open the correct transcript. Both existing local ports work after sign-in.
- Screens visually inspected at 1440px and 390px: learning path, call review, sign-in and manager desk. No page horizontal overflow. Core text contrast ratios range from 5.3:1 to 13.19:1. This is focused QA, not an accessibility certification.
- Original microphone WAVs/evidence and both authorization ledgers match their prior hashes. All 14 training-data tables and 33 original static WAV assets are unchanged. Authentication audit/session records from browser sign-in are expected.

No new paid call, physical microphone capture, real invitation, credential change, customer upload, deployment or estimator modification occurred. All mutations during learner/manager workflow QA used a separate temporary database.

## Boundaries

The just-completed recording predates the shared clock, so its mix is **explicitly approximate**, using existing file origins. Future shared-clock capture is verified with the mock only; it has not been tested with another paid provider call. Device latency and microphone echo remain outside the mix. Chrome playback was muted; no human listening-quality assessment was performed.

Readiness still requires a manager. Multi-company tenancy, real invitations and production deployment are not implemented. [Future workspace design](FUTURE_WORKSPACES.md) describes company isolation and configurable industry scenarios without requiring base-model retraining.

## Evidence and screenshots

- [Combined recording details and costs](COMBINED_PLAYBACK.md)
- [267-test output](artifacts/polish-test-results.txt)
- [Saved-call / responsive browser checks](artifacts/polish-browser-review.json)
- [Full learner-to-manager browser checks](artifacts/reliability-browser-results.json)
- [Follow-up browser checks](artifacts/followup-reliability-browser-results.json)
- [Preservation checks](artifacts/polish-preservation.json)
- [Sign-in](artifacts/polished-sign-in.jpg)
- [Learning path](artifacts/polished-learning-path.jpg)
- [Full-call review](artifacts/polished-combined-call.jpg)
- [Phone call review](artifacts/polished-combined-call-mobile.jpg)
- [Manager desk](artifacts/polished-manager-desk.jpg)

Library delivery was attempted with the current required upload helper. The network-enabled attempt stopped during tool discovery because the prepared upload capability was unavailable; no Library file IDs were returned. The skill forbids switching a started upload to a direct action. All screenshots are complete locally. See `artifacts/polish-library-delivery.json` for the bounded failure record.
