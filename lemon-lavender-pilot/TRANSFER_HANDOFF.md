# Lemon & Lavender voice AI training — Claude Code handoff

Prepared November 6, 2026 from the current local source snapshot. Start here; all pre-existing Markdown documents are historical and may contain superseded claims. The source project and its paused audit were not modified or resumed. This is a clean local continuation package, not a production backup.

## Setup (free, provider-off)

Use Python 3.12. macOS is the original target; installed speech generation and credential helpers are Mac-specific. Existing synthetic WAV assets are included, so ordinary rehearsal does not need speech regeneration or an API key.

```sh
cd lemon-lavender-pilot
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py seed_demo
.venv/bin/python manage.py runserver 127.0.0.1:8765 --noreload --nothreading
```

Open http://127.0.0.1:8765/sign-in/ locally. Sign in as learner@example.invalid, trainer@example.invalid, or admin@example.invalid through the local preview link. No real email is sent. This creates a fresh fictional database under .data; old learner progress and recordings are intentionally absent. Stop any conflicting local server yourself or choose a free loopback port; do not terminate the original pilot.

Dependencies are pinned in requirements.txt (Django 5.2.18, asgiref 3.12.1, sqlparse 0.6.0, websockets 17.2). The transfer verification reused the original installed Python environment without copying it; fresh package installation was not tested. Standard library SQLite is the default. Do not enable LL_LOCAL_POSTGRES_DB during initial setup.

## Current implementation

Local Django, server-rendered HTML, vanilla JS/CSS. Six active sales lessons, saved written rehearsals, branching scripted callers, objections/difficulty/drills, learner navigation, manager feedback, evidence and reports are implemented. AI feedback is provisional; manager evidence is required for readiness. A win uses an explicit simulated paid deposit. Current verified promotion catalog is empty.

Optional live voice code includes a provider relay, budget guards, capture/playback, transcript alignment, coaching and owner-operated acceptance flows. Historical work reports successful bounded voice tests, but human voice naturalness, interruption/device reliability and trainee usability are still unresolved. This transfer did not make any provider request or use a microphone. Do not interpret old “ready to launch” or “390 tests pass” statements as current acceptance or authorization.

Entry points: config/settings.py (provider-off defaults and local database); training/models.py and migrations/; training/curriculum.py, sales_content.py, sales_scenarios.py, owner_decisions.py and policies.py; training/live_provider.py, live_runtime.py, live_budget.py and live_coaching.py; training/static/training/ and templates/. docs/sales-materials/ contains versioned fictional curriculum/caller/rubric exports.

## Verification of this transfer

Ran the copied source using Python 3.12 from the existing environment, with network connections, native Keychain framework loading and the security CLI blocked by a Python audit hook. No original application server or data was used.

- 390 tests ran: 387 passed; 3 errored. This is not a fully green suite.
- Two QualityBudgetTests require artifacts/quality-configuration-review/original-unused-grant.json, intentionally excluded because it is a live authorization artifact. Replace this coupling with synthetic, inert fixtures before expecting portable full-suite success; do not copy or reconstruct the old grant.
- test_keychain_failure_is_generic_no_fallback attempted the Keychain metadata CLI; the guard blocked it before execution. Mock login_keychain in this test so verification remains credential-independent.
- Django check passed; makemigrations --check --dry-run reported no changes.
- Original copied-file hashes were rechecked unchanged; ZIP integrity and per-file SHA-256 manifest were checked.

See transfer-verification/ for exact logs and the portable guarded test runner. Run `.venv/bin/python transfer-verification/verify_offline.py check` or `... test --verbosity 1`. The guard does not make arbitrary scripts safe; inspect them before running. No browser walkthrough, human acceptance or clean dependency install was performed during transfer.

## What to do next

1. Read this handoff and CLAUDE.md, install into a fresh environment, and launch ordinary fictional rehearsal.
2. Fix the three portable-test limitations using mocks and synthetic fixtures; preserve the authorization checks rather than relaxing them.
3. Review the source against COMPREHENSIVE_AUDIT.md, SALES_ENHANCEMENT_BACKLOG.md, OWNER_REVIEW_DECISIONS.md and VOICE_ACCEPTANCE_PLAN.md. These describe earlier work, not a resumed/completed later audit. The October 14 audit backup remains on the original Mac; its internal snapshot and runtime artifacts were not transferred.
4. Confirm outstanding owner policies: trainee baseline/daily duration, quoting/booking/deposit authority and terms, promotion dates/eligibility, rubric thresholds and critical-failure rules. Jobber integration/form mapping remains unverified; multi-company workspaces and production identity/deployment remain future work.
5. Only after separate explicit owner instruction, design a fresh bounded human voice acceptance test. Existing Mac launchers and hardcoded approval references must not provision spending based on historical text.

## Credentials and omissions

No credentials are needed for ordinary rehearsal. For a later owner-authorized Mac live test, review CREDENTIAL_SETUP.md and the keychain setup/entry code. The owner configures their own project key privately using the reviewed native setup flow; never paste a key into Claude, a source file, log or transfer. The service/account identifiers are com.lemonlavender.training-center.openai / training-center-project-api-key. No Keychain contents were read or exported. The adapter has no automatic env-file fallback; non-Mac live credentials require deliberate implementation and tests. Credential setup does not authorize spending.

Excluded entirely: .data (databases, learner/customer records, recordings, sessions, paid ledgers/grants); artifacts (screenshots, logs, prior source backups and live-test evidence); .venv; bytecode/cache files; secret environment files; authentication/browser state; symlinks; Git history. Historical artifact links therefore will not resolve. Synthetic prerecorded WAVs under training/static/training/audio are included and are not private human recordings. Business policy and fictional scenario source are included. No data migration from the original runtime occurred.

Original launchers and credential/budget implementations are retained as source for review only. The new CLAUDE.md and this handoff supersede historical instructions to reuse old grants or access the original machine. All copied application source is unchanged; added handoff files and banners on historical Markdown are the only intentional packaging edits.

## Update — November 6, 2026 (Claude Code, Linux container)

Fresh Python 3.12 venv, clean `pip install -r requirements.txt`: worked. `check` and `makemigrations --check` clean. App launches; `/sign-in/` returns 200.

The three portable-test limitations are fixed, test-only (no production code changed):

- `QualityBudgetTests` (2 tests) now build an inert synthetic grant through the production `prepare()` path and patch `quality_configuration_review.REVIEW` to match it. The real grant is not copied or reconstructed. A mutation check (mismatched review hash) still raises `BudgetDenied`, so the refresh check is still exercised.
- `test_keychain_failure_is_generic_no_fallback` mocks `login_keychain`, so it never touches the Keychain or the security CLI.

Result: **390 tests, 390 pass** (via `transfer-verification/verify_offline.py test`). No provider call, Keychain access, microphone use or deployment happened.
