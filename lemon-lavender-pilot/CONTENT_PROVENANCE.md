> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# Content provenance and current decisions

Compiled from the delegated task and parent-thread updates on 2026-10-06. This implementation did not fetch private Drive documents or copy a paid curriculum. Parent reported inventory of 55 files in 14 folders and 11 reviewed full texts, not a complete content audit. All lessons and scripts here are short original material.

## Current authority

Latest explicit owner decisions override older workbook, SOP, handbook, and public marketing conflicts:

- L&L only; residential only; complements Orchard.
- Move In / Out; Deluxe Deep standalone or initial; recurring weekly, biweekly, monthly. No quarterly service.
- New recurring customers require an initial deep; no waiver. **More than 30 days without a clean requires a deep-clean reset**. This supersedes the intermediate conditional “may” instruction.
- **48 hours cancellation notice.** Fee amount and waiver authority remain pending. No website was changed.
- Owner's mission: become Portland's most trusted cleaning company for people's homes; background-checked, fully trained technicians; high-quality, thorough top-to-bottom cleaning. Ideal customers want well-maintained, clean homes.
- The owner explicitly approved the employee handbook's five values: **Integrity, Quality, Professionalism, Safety, Reliability**. Relevant service and professional principles inform the chapter; US employee terms were not applied to a Philippines VA.
- No customer online booking now; a request is distinct from confirmed booking, quote approval, and payment.

The policy snapshot is `ll-fictional-2026-10-06-v5`. All quote figures are fictional practice examples under the provided rules, not customer proposals.

## Pricing supplied in the handoff

Base = max(service minimum, 5 × ceil(square feet × 17 / production rate)). The stated hourly production price is $85. Rates/minima: monthly 650/$150; biweekly 775/$110; weekly 850/$110; deep 300/$325; move 275/$400. More than 4,000 sq ft requires a walkthrough. Final total rounds upward to $5.

At 2,000 sq ft: monthly $265, biweekly $220, weekly $200, deep $570, move $620. Oven $45, fridge $45, dishwasher $35, cabinets $65; these four are included in Move In / Out. Windows are $8 with unresolved unit, so automated quotes reject that extra. Recurring extras reject automatic quoting while frequency is unresolved. Freezer unit is unresolved and is not priced.

## Source references supplied by the parent

- [Selected mentorship folder](https://drive.google.com/drive/folders/1A89ZXpsqJjVk2SSz1sodRjN0wKwrS6Dw)
- [Readiness kit](https://drive.google.com/file/d/13bTEmqiYBfyrU5dbzdgm4eIoPgVH9nSk/view): learn/practice progression; review wins, losses and uncertain calls; coach one observable behavior over 10 calls.
- [Module 8](https://drive.google.com/file/d/19cUaius9XY5FVb0-xlqvvsSIfmSzO1Ez/view), [Module 9](https://drive.google.com/file/d/1YfH-mCN23tL5f7JQuDpjkTkron5ePwdT/view), [Module 10](https://drive.google.com/file/d/1C91j6P_0hZ7OOqcsJJnTUmodOl1Eqt31/view): summarized service knowledge, structured discovery before price, scope/pricing, relevant value, objections, explicit closing, handoff, follow-up/recurring conversion, and coached practice.
- [Employee handbook](https://docs.google.com/document/d/1c0MZWAV8Jz7S31DtwYZ4E25-a8dUtbiT/edit), §§1.3–1.4: approved five values and brand language. No US employment policy or historical business-plan finances are included.
- [Company About page](https://lemonandlavendercleaningco.com/about): parent supplied founder/family-owned summary. Do not make absolute product-safety claims.
- [Existing VA workbook](https://docs.google.com/spreadsheets/d/1ostYR6oRQGLsayllj4qa0smGeK0SXbIc/edit): known stale service/payment rules. Not used as current policy authority.
- Parent summarized the VA SOP's regional place names. These are geography context; not an independently approved coverage list. Old service menu is superseded.

The parent noted conflicting 24-hour contact-page search-index wording versus 48-hour terms; the 24-hour live page was not verified. The owner's subsequent 48-hour confirmation is the implemented rule.

## Pending, deliberately not invented

Payment and deposits, discount authority, cancellation fee and waiver authority, holiday exclusions, final-message delivery channels, escalation contacts, detailed geographic eligibility and decline rules, window/freezer units, recurring extras frequency, rubric weights and passing rules. Current exercise teaches escalation instead of inventing those answers.

## Technical references

Used the official [Django download/support page](https://www.djangoproject.com/download/) to select the 5.2 LTS family and the [Django signing/security documentation](https://docs.djangoproject.com/en/5.2/topics/signing/) while reviewing token handling. Dependencies were downloaded from the standard Python package registry into the isolated virtual environment. No paid services or user accounts were created.


## Owner-approved inbound lead follow-up addition

A subsequent direct owner instruction supplied the Google/Facebook inbound lead sequence. It is versioned separately as `owner-lead-followup-2026-10-06-v1`. It covers immediate live-call answering; completed first outreach within five minutes; day 1 end of day; day 2 morning and end of day; day 3; final message, archive and stop if there has been zero communication. Email requires a valid address; explicit preferences govern channels; any response exits the no-response sequence and opt-out stops outreach. Callback promises are tracked instead of blindly continuing the sequence.

The instruction authorizes training only. Its initial v1 snapshot left business-day meaning unresolved. Later owner clarification confirms Monday–Friday business days and 08:00–17:00 America/Los_Angeles office hours. Follow-up policy v2 recorded both, with inbound snapshots v4 at that stage. The owner then approved first outreach for after-hours leads by 08:05 on the next business day. Follow-up policy v3 and new inbound snapshots v5 record that approval. The exercise interprets this as the next business opening: before opening on a weekday uses that morning; closing time or later advances to the next weekday. This is visible in the lesson and covered by tests. Holiday exclusions and final-message delivery channel(s) remain unresolved. No real scheduling, sending, or lead modifications are implemented. Earlier call/workflow attempts keep their original snapshots and evidence.

## October 7 UX and audio update

Andrew requested clearer wording, improved local preview audio, exact matching to his public Jobber request form, and three training paths. Copy and layout were updated without changing company rules. Detailed service inclusions not supplied in the approved source remain unverified.

Jobber form 1901199 at the supplied hub, including the attribution URL, could not be inspected past its public security-verification page. No fields, required statuses, options, or conditional logic have been inferred. No request was submitted. The local form remains practice quote notes, explicitly not a verified Jobber replica. See `JOBBER_FORM_MAPPING.md`.

New scenario version inbound-2000-v2 snapshots shorter original scripts and the Samantha-v2 audio version. Feedback wording version observations-v2-unapproved keeps weights and pass thresholds unset. Prior attempt snapshots, recorded feedback, and audio files remain unchanged.

## Guided redesign and readiness kit

The latest redesign replaces the three-card landing page with one Continue action and seven original lessons / 21 short steps. `guided-foundations-2026-10-07-v1` snapshots lesson content and current policy version on first saved work; previous completion timestamps are retained and transparently credited. Company rules are unchanged.

The parent supplied an all-six-page review of **Before You Hand Them the Phone: Sales Rep Readiness & Coaching Kit** (Cleaning Business Fundamentals), Library `libfile_979975bddaa88191bf5e32c8e153b3ac`. The implementation adapts its five readiness areas (pp. 2–3), supported progression (p. 4), whole-job handoff and win/loss/uncertain review (pp. 3, 5), and one-behavior/ten-attempt coaching (pp. 3, 5–6). This is an adaptation of that supplied review, not a claim of personally rereading the PDF here. No full paid lesson is reproduced. Detailed source-to-feature mapping and official comparable-platform documentation are in `DESIGN_RESEARCH.md`.

New inbound attempts use scenario `inbound-2000-v3` and `samantha-v3` audio. Optional local trainee recordings are separate evidence, never passed off as a transcript or audio score. No policy, outcome-validator rule, rubric weight, or readiness threshold was changed to accommodate the voice or interface.

## Further coverage pass

Guided foundations v2 keeps the same seven lessons and 21 steps. It restores approved orientation context from the older local welcome material, explains the existing pricing calculation with verified examples, and adds original own-words follow-up, objection and complaint rehearsals. Pacific/Manila examples were verified with Python zoneinfo; price examples use the existing approved quote engine. No new external source or company policy was introduced. Saved v1 lessons are not rewritten. See `CURRICULUM_COVERAGE.md`.
