> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# Navigation pass complete — October 8, 2026

**Verified local URL:** http://127.0.0.1:8765/course/1/

Project: `/Users/macintoshfamily/Documents/Codex/2026-10-06/task/lemon-lavender-pilot`.

Use `learner@example.invalid`, request the local preview link and confirm. No real email is sent. A fresh sign-in may be needed after the normal servers were refreshed. The app remains available only on this Mac. The estimator was not modified.

## What changed and why

| Observed before, using a fresh learner in Chrome | Delivered behavior |
| --- | --- |
| Home exposed 16 visible links/buttons and large cards repeated lesson and section actions. | Five visible actions: one main next step and four compact stage links. Secondary tools and the original outline are under Resources. All four stage names and their order are preserved. |
| The recommendation and saved-draft resume competed. | Home resumes the latest unfinished lesson draft, or an active timed call first. Without saved work, it follows the learning order. Lesson completion continues in stage order. No new completion gates. |
| Section buttons jumped straight into lessons without an overview. | Each stage has a short purpose, progress, one main action and a focused content list. These pages also provide a stable return point from lessons. |
| Orientation acknowledgment returned to home, requiring another choice. | Its one acknowledgment continues directly to choosing the right service. Orientation remains separate from the six-lesson denominator. |
| Checked written responses still showed Check and Continue as competing actions. | The checked answer folds under “Review or edit your answer”; Next stays primary. Editing hides Next until the changed response is checked. Save & return home preserves the exact draft; unsaved changes receive the browser’s leave-page warning. |
| Lesson checks returned to the top of the page. | Checking returns to the response/feedback anchor. Back, stage overview and Training home are consistently available. Teaching detail remains intact; rationale and supporting detail use progressive disclosure. |
| Practice promoted the caller library, guided call, exports, voice testing and coaching at once. | One state-aware action starts/resumes practice, opens a submitted call or reads trainer feedback. Alternate callers, drills, history and test details are discoverable below. The local simulation and disabled live mode are stated plainly. |
| Submitted/reviewed/expired calls buried the next step below long transcripts; some blocked actions returned bare error text. | A learner summary appears at the top with waiting status, trainer feedback or a fresh-attempt action. Explicit retry retains earlier evidence. Existing prerequisite, review and daily-limit blocks now include an appropriate return action. |
| Signing in from a lesson link dropped the trainee at home. | An allowlist preserves protected read-only lesson, stage, practice and review destinations. Valid caller/difficulty/drill selections survive too. External URLs, mutation endpoints and unrecognized parameters are rejected. Destination views still enforce ownership. Scanner-safe confirmation remains; the token field is hidden from the learner UI. |
| Feedback showed five readiness areas prominently even without a manager observation. | The learner sees the coaching focus and next action first. Detailed writing, history and readiness evidence remain available in a disclosure. The manager’s coaching desk and review controls remain separate. |

No lessons, written answers or snapshots were rewritten. The six lessons, 18 steps and four written rehearsals remain. Services/pricing/reference content and all original recording files are preserved. Reference browsing no longer presents a competing “mark as read” progression button; existing compatibility endpoints remain unchanged.

## Current real saved state

The current learner has **6 of 6 lessons complete**, orientation reviewed, and a submitted corrected fictional call awaiting a manager. Home therefore opens that saved call for review. This state was already present in the backup taken before this pass; the navigation work did not award completion or a review.

[Current desktop screenshot](artifacts/navigation-current.jpg) · [Current mobile screenshot](artifacts/navigation-current-mobile.jpg). The desktop screenshot was successfully saved to ChatGPT Library as **navigation-current.jpg**; [delivery record](artifacts/navigation-library-delivery.json).

## Verification

- **364 automated tests pass.** Thirteen navigation checks were added; older label assertions were updated for the new UI. [Full output](artifacts/navigation-tests.txt). Django system checks and migration drift check pass; no new dependency or migration.
- [Full Chrome journey](artifacts/navigation-browser.json), in a disposable fictional database: safe sign-in/deep link; four accessible stages; incorrect answer and retry; partial-writing guidance; save/logout/login/exact resume; checked-answer editing; all 18 steps and orientation in order; local practice; incomplete submission; actual trainer review through the UI; separate retry; ending early; Back/Forward; keyboard focus; and layouts at 1440, 768, 390 and 320 pixels. No microphone or provider connection.
- [Additional browser states](artifacts/navigation-state-browser.json): caller-selection deep link survives sign-in; expired attempt is unchanged on GET and an explicit new start preserves earlier evidence. The completed/manager-ready presentation used a clearly fictional seeded review fixture; it does not establish a new competence judgment or replace a real manager acceptance test.
- [Normal-app browser checks](artifacts/navigation-main-browser.json): current progress and five-action home; stage deep link retained through sign-in; all stage pages available; original voice tracks and coaching still reachable; paid controls disabled. One quotation error in the verification script was repaired before the final successful run; it was not an application failure.
- [Preservation report](artifacts/navigation-preservation.json): every original row in 17 training tables is unchanged, and 49 tracked files retain identical SHA-256 hashes, including curriculum, policy, recordings, evidence and all paid authorizations. Only local mock sign-in authentication records were added. Backup: `.data/before-navigation.sqlite3`; baseline: [before-navigation.json](artifacts/before-navigation.json).
- Normal provider-off servers: port 8765 PID 92644; port 8767 PID 92645. [Process evidence](artifacts/navigation-servers.json). The quality-test port 8769 remains stopped.

Before screenshots and observations: [home](artifacts/navigation-before-home.jpg), [practice](artifacts/navigation-before-practice.jpg), [inspection findings](artifacts/navigation-before.json). Additional after screenshots: [fresh learner](artifacts/navigation-new-learner.jpg), [practice](artifacts/navigation-practice.jpg), [waiting for review](artifacts/navigation-awaiting-review.jpg), [trainer feedback](artifacts/navigation-trainer-feedback.jpg), [expired practice](artifacts/navigation-expired.jpg), [completed review fixture](artifacts/navigation-completed-review.jpg).

## Scope boundaries and audit handoff

This navigation implementation and its usability-flow verification are complete. Andrew subsequently requested a comprehensive application audit. **That separate audit has not been performed in this turn.** The parent should start it at the newly selected extra-high reasoning setting. This active turn did not change its inference setting, the app’s API models, provider limits, credentials or permission settings. The reminder to lower reasoning remains pending until the major audit/build work is finished.

Highest-risk unresolved areas for that audit:

1. **Real voice quality remains unaccepted.** Local flow tests do not establish conversational naturalness, real interruption recovery or faithful live playback/transcript timing. Historical recordings retain their existing timing limitations. The separately approved voice-quality grant remains prepared, unused and byte-for-byte unchanged; it was not started during this work.
2. **Demo access is not production invite-only identity.** Anyone on this Mac can choose the fictional demo roles, as disclosed. This is a loopback-only pilot, with no production deployment or real staff/customer data authorized. Audit role/ownership enforcement, token lifecycle, redirect validation and audio/upload handling before proposing a real deployment.
3. **Coaching and readiness remain human decisions.** Proposed rubric weights and unresolved company policies are still unapproved. A scripted practice choice, a verbal yes, lesson completion or a provisional AI observation does not prove a booking/payment or employee readiness.
4. **Browser QA is not a human usability study or a comprehensive security audit.** The major paths passed; concurrent tabs, repeated requests, full failure recovery and accessibility beyond the tested keyboard/responsive flow should receive a distinct audit review. Existing regression tests cover many of these areas, but this pass does not claim exhaustive coverage.

Recommended next improvements, after the audit priorities are assessed:

- Watch one trainee complete a lesson and practice call without guidance; use their actual hesitation points to decide what still needs simplifying.
- Consider a clearer in-call sequence for conversation → handoff notes → submission. The current practice form remains detailed; the navigation pass did not remove scenario choices or rewrite assessment logic.
- Turn approved company-policy decisions and trainer review expectations into concise, versioned guidance before real learner onboarding.

No new paid calls, physical microphone use, credential access, invitations, deployment, multi-tenant build or purchases occurred. The original corrected fictional test remains archived under its closed $2 / 10-minute authorization; no allowance was reset or reused.
