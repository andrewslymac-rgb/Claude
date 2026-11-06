> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# Sales practice enhancement — October 8, 2026

New local practice is available at [Choose a caller](http://127.0.0.1:8765/course/1/scenarios/) and [Practice progress](http://127.0.0.1:8765/course/1/practice-report/). Sign in using the existing fictional email preview. No real email is sent. Port 8767 also serves the normal provider-off app.

The six-lesson, eighteen-step core outline is unchanged. This pass extends the Practice studio, existing Attempt records, saved notes/recordings, trainer reviews and retries. It does not create a second course framework, enable a provider, or change owner credentials.

## Useful new behavior

- **13 caller situations, 3 difficulties and 4 practice formats.** A full guided call, discovery drill, objection rounds or closing drill can use a saved versioned caller. Focused drills explicitly mark earlier steps as supplied context, never learner credit.
- **Customer resistance changes with actions.** Closing early gets a refusal. Intermediate callers need acknowledgment and clarification before an answer resolves a concern. Advanced callers raise a second concern. Trust, insurance, supplies and other unconfirmed facts hold the decision for manager confirmation. A partner decision remains follow-up only. Office work is a residential-service non-fit. A trial close is interest, never a commitment; a choice of next steps still requires actual agreement.
- **Independent outcome checks.** Customer agreement alone is insufficient. The validator replays supported action evidence, verifies the accepted close and actual saved property/estimate/disposition fields, and distinguishes a practice request, follow-up, escalation, incomplete work and policy correction. Written note meaning remains human-reviewed. Unsupported promises block readiness even if other selected actions were good.
- **Draft rubric and useful feedback.** Eight review areas have proposed weights totaling 100%, with closing/handoff largest at 30%. Weights are unapproved and no numerical score or pass is calculated. Feedback cites exact selected-script quotes and offers a concrete better response. Audio clarity, pacing and spontaneous listening remain unassessed until a manager listens.
- **Actual-data reporting and exports.** Reports show full-rehearsal request rates by caller and encountered concern, two ten-attempt windows, flagged practice areas, UTC activity streak, reviewed counts and saved recording duration. Focused drills, legacy calls and provider tests are excluded from these request-rate comparisons. Non-fit/escalation/follow-up may be correct outcomes. Protected JSON exports and WAV downloads include no credential or account data.

These new conversations are **local scripted branching rehearsals with text customer replies**. Learners may record their own unscripted response locally for a trainer, but the local customer cannot hear it. The live caller configuration is rendered from the same versioned content and wired into `conversation_config`; its new prompts have not been tested with a live provider. New live calling remains disabled, and persona selection does not arm or widen an existing paid authorization.

## Nine-area coverage

| Requested area | Delivered in this pass | Remaining boundary / next priority |
| --- | --- | --- |
| 1. Caller prompts and schema | Versioned role-separated caller renderer, allowlisted parameter schema, trainer prompt preview, difficulty and commitment rules; configuration excludes learner notes/hints/transcripts | Provider behavior, naturalness and open-ended resistance need an explicitly approved acceptance test; prompt wording is not proof of those qualities |
| 2. Varied personas | All 13 requested situations, with backstory, motivation, communication style, hidden concern, buying signals and win/loss boundaries; all persona/difficulty paths locally tested | More independent scenario variants and observed real-model behavior; no demographic stereotypes or new commercial/turnover service claims |
| 3. Objection bank | 15 themes with variants, clarification questions, original model wording and sales principle, including price, trust, insurance, satisfaction, presence, supplies, timing, pricing basis, contracts, partner decision, ballpark, discount, scope and payment | Owner confirmation of unresolved company facts before any response can assure them |
| 4. Inbound flow | Brand greeting, property/size/rooms, priorities/condition/pets/frequency/extras, timing/location, relevant value, approved estimate, concerns, trial/explicit/choice close and saved handoff | More natural unscripted phrasing; final operational booking/payment remain external and unconfirmed |
| 5. Postcall rubric | Versioned proposed weights, independent outcome validator, exact evidence, better response, policy blockers, human review and retry | Owner approval of weights/pass rules; no numeric score, inferred vocal performance or employment automation |
| 6. Progression and drills | Current lessons grouped into five recommended stages; discovery, objection and closing drills; activity streak; optional spoken response recording | Full unscripted two-way assessment and approved unlock rules remain pending; no new hard score gate or altered core outline |
| 7. Manager reporting | History, outcome windows, rates by persona/encountered objection, flagged practice areas, saved audio duration, JSON evidence/WAV export | No invented engagement time; recorder length and provider session seconds are not focused learner time. Larger-scale aggregation/pagination can follow actual use |
| 8. Practice UX | Session countdown, separate optional hints, clear script/evidence labels, preserved end-early/retry flow, recording integration, evidence links, mobile layout and downloads | No misleading pause/billing claim. Exact transcript/audio synchronization and live interruption/latency work remain; legacy audio stays separate |
| 9. Versioning and refinement | Policy/scenario/engine/prompt/rubric snapshots, original content exports, prompt changelog and on-topic/role guards | Future changes require new content versions and evidence review; no automatic prompt-learning process or policy invention |

## Verification

- [318 automated tests passed](artifacts/sales-enhancement-tests.txt), including the original regression suite. New coverage exercises all 156 caller/difficulty/format configurations, all 39 full-call persona/difficulty decision boundaries, dynamic acknowledgment/probe resistance, second objections, trial/choice closes, unknown policy, forged evidence, quote checks, scoped drills, denied writes, stale tabs, expiry and preserved retry snapshots.
- [Disposable browser flow passed](artifacts/sales-enhancement-browser.json): advanced two-concern request, partner follow-up only, commercial non-fit, generated PCM recording upload/download, evidence export, trainer review/retry, actual-data reporting and mobile fit. No physical microphone or external request was used.
- [Normal port 8765 checked](artifacts/sales-main-browser.json): six active sales lessons; repaired writing feedback; retired complaint content read-only; new library/report routes; no QA outcomes in main data; paid mode disabled; human/synthetic call labels and protected original-track download correct.
- Django system check and migration check pass. No model migration or new dependency is needed for this pass.
- The private pre-change backup is `.data/before-sales-enhancement.sqlite3`. [Preservation comparison](artifacts/sales-enhancement-preservation.json) records table/file checks. Local mock sign-ins add only their normal authentication records; no original training answers, attempts, reviews, recordings or paid-test ledger entries are rewritten.

Browser screenshots: [caller chooser](artifacts/sales-caller-library.jpg), [mobile](artifacts/sales-caller-mobile.jpg), [evidence feedback](artifacts/sales-scenario-feedback.jpg), [manager report](artifacts/sales-manager-report.jpg), [repaired feedback on port 8765](artifacts/sales-main-written-feedback.jpg).

## Reviewable material and implementation

- [Parameter schema](docs/sales-materials/caller-parameters.schema.json), [persona library](docs/sales-materials/caller-library-v1.json), [objection bank](docs/sales-materials/objection-bank-v1.json), [draft rubric](docs/sales-materials/rubric-draft-v1.json), [advanced scenario snapshots](docs/sales-materials/scenario-snapshots-v1.json), [rendered caller prompts](docs/sales-materials/caller-prompts-v2.md).
- Regenerate those six exports with `.venv/bin/python manage.py export_sales_materials`. They are built from the app configuration, not maintained as a conflicting second source.
- Content and schema: `training/sales_content.py`, `sales_scenarios.py`. Actor/state: `sales_actor.py`. Independent evidence/outcome/rubric: `sales_feedback.py`. Existing-flow views/forms: `sales_views.py`, `sales_forms.py`. Read-only reporting/export: `sales_reports.py`.
- [Prompt changelog and extension rules](CALLER_PROMPT_CHANGELOG.md). [Voice inspection and proposed acceptance test](VOICE_ACCEPTANCE_PLAN.md).

## Next priorities

1. Andrew/trainer should review the proposed rubric and unknown policy responses using the new local rehearsals. No paid approval is needed to use this slice.
2. Establish supported provider interruption/cancellation handling with local protocol mocks, then use the concrete voice acceptance plan if a new bounded provider test is separately authorized. Existing closed authorizations are never reopened or replenished.
3. After that evidence, add a genuinely unscripted assessment and reliable transcript-to-audio annotation. Keep speech clarity coaching tied to audible evidence and manager judgment.

No paid call, new provider authorization, purchase, credential change, real invitation, customer-data upload, remote publication or estimator modification occurred in this enhancement pass.
