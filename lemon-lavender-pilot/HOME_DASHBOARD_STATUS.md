> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# Four-section training homepage — October 8, 2026

The normal app is verified at http://127.0.0.1:8765/course/1/ . Sign in using `learner@example.invalid` and the local email-preview link, then confirm. Nothing is emailed. The app remains on this Mac only. Restarted app sessions may need a fresh local sign-in.

The homepage now shows the requested order, a concise purpose for each section, existing progress, Start / Continue / Review actions, the next recommended step and a separate saved-draft resume link when needed. All sections remain accessible. Existing practice prerequisites and manager review rules still apply; this dashboard adds no locks or readiness threshold.

| Section | Existing content and destinations | Lesson denominator |
| --- | --- | --- |
| 1. Start Here: Meet Lemon and Lavender | `welcome`: company introduction, values and local context | 1 |
| 2. Learn the Industry and Our Portland-Area Customers | New short orientation guide; `services` and `pricing`: service selection, mandatory initial deep, discovery, scope and quoting | 2 |
| 3. Handle Sales Objections | `objections`: clarify concerns, relevant value, policy boundaries and legitimate non-fit | 1 |
| 4. Practice with Role-Playing | `conversation` and `followup`: discovery, explicit close, handoff, response times and follow-up; Practice Studio links callers, drills, recordings and feedback | 2 |

The six original lessons, 18 steps and four written rehearsals remain intact. The original outline remains expandable on the homepage. Lesson breadcrumbs and completion recommendations follow the four-section order. Reference links expose orientation, discovery, pricing, objections, closing and follow-up. The manager homepage remains the coaching desk.

The new guide has a separate, explicit “reviewed” acknowledgment. It never adds lesson credit or a score, changes earlier completion timestamps, or marks someone ready. The current saved learner still has **6 of 6 lessons complete** and an **unreviewed orientation guide**; the guide is therefore the next recommendation. Practice counts reflect actual saved records, with no invented completion target. Work completed under older lesson versions continues using its saved snapshot.

Geographic facts are limited to neutral city/neighborhood context from the [City of Portland neighborhood directory](https://www.portland.gov/neighborhoods) and [Multnomah County’s city list](https://multco.us/info/about-multnomah-county), checked October 8. Geographic examples are not an approved service-area list. The guide asks about the individual customer’s needs and does not infer preferences, home condition or budget from age, income or neighborhood. It covers residential sales only.

## Verification

- **351 automated tests pass**, including eight new dashboard tests. Django system checks and migration drift check pass; no migration required. [Suite output](artifacts/home-dashboard-tests.txt), [targeted output](artifacts/home-dashboard-targeted-tests.txt).
- [Disposable Chrome verification](artifacts/home-dashboard-browser.json): all section links, six-lesson denominator, exact saved-draft resume, Back/Forward, explicit guide acknowledgment, no GET completion, Reference links, trainer read-only view, keyboard Tab traversal with visible focus, and no horizontal overflow at 1440 / 768 / 390 / 320 pixels. No microphone or provider was used.
- [Normal app verification](artifacts/home-dashboard-main-browser.json): actual saved progress and section mapping, corrected fictional call available, and paid voice starts disabled. [Normal server PIDs](artifacts/home-dashboard-servers.json): 8765 and 8767 remain provider-off. No quality-test server started.
- [Preservation evidence](artifacts/home-dashboard-preservation.json): all original rows in 17 training tables unchanged; 47 audio, evidence and authorization files match their prior SHA-256 hashes. Browser sign-in only adds local authentication records. Backup: `.data/before-home-dashboard.sqlite3`; baseline: [before-home-dashboard.json](artifacts/before-home-dashboard.json).
- [Current desktop screenshot](artifacts/home-dashboard-current.jpg) and [mobile screenshot](artifacts/home-dashboard-current-mobile.jpg) show the normal database. The desktop screenshot was also successfully saved to ChatGPT Library as `home-dashboard-current.jpg`; [delivery evidence](artifacts/home-dashboard-library-delivery.json).

Two verification harness issues were corrected without changing product behavior: the disposable directory initially used the Mac temp root instead of the required `/tmp` prefix, and the saved-call check initially looked only at visible text even though the provider-off notice is inside a collapsed disclosure.

## Paid history and remaining work

The previously requested corrected fictional OpenAI test and transcript coaching already succeeded. Its original $2 / 600-second ceiling and complete history remain unchanged: 234 total provider voice seconds, approximately $0.1959664 combined estimated cost (invoice unverified), both reserved starts consumed, authorization closed. [Original provider evidence](artifacts/corrected-live-provider-verification.json), [saved call](http://127.0.0.1:8765/live/eaee3e09-ea2d-459e-a6a5-acb252a0708a/).

No new API request, credential access, microphone activation, email, purchase, deployment or estimator change occurred for this dashboard. The separately approved voice-quality grant remains prepared and unused, byte-for-byte unchanged. Human voice-quality acceptance and unresolved company policy/rubric decisions remain separate work; no further approval is needed to review this dashboard.
