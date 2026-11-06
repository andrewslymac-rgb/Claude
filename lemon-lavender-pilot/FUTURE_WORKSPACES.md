> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# Future company workspaces — design only

The current product remains a local Lemon & Lavender training app. There is no company switcher, multi-company access boundary, external invitation system, or SaaS deployment. This expansion is deliberately deferred while the L&L experience is refined.

Other companies could use the same training structure with their own approved material and scenarios. This design does **not** require retraining the base model. Configure the customer persona, goals, objections, approved policies, industry vocabulary and coaching rubric for each workspace; supply only the relevant approved reference material to each call. A future fine-tuning decision would be separate and justified by measured results.

## Proposed boundaries

- **Workspace:** company identity, branding, settings, approved materials and usage budget. L&L would be the first workspace.
- **Membership:** a person may belong to multiple workspaces, with explicit owner, admin, trainer or learner roles in each. Being an admin in one must never grant access to another.
- **Learning:** company-owned courses, assignments, progress and manager reviews. Every attempt saves the exact policy, scenario and rubric versions used.
- **Industry scenarios:** configurable fictional customer personas, discovery requirements, common objections, permitted commitments, non-fit criteria and escalation rules. Sales remains the objective where appropriate; other training goals need their own approved outcomes.
- **Separate responsibilities:** the customer actor responds to scenario requirements; an outcome validator checks actual practice actions; the grader provides evidence-linked provisional coaching; the manager decides readiness.
- **Reference approval:** draft/import → company review → versioned approval → use in practice. Generic industry content cannot override company policy. No automatic ingestion of unreviewed documents.
- **Data separation:** workspace IDs and authorization checks throughout relational data, recordings, file access, background jobs and retrieval indexes. Cross-workspace tests must cover guessed URLs, search results, exports, billing and manager access. PostgreSQL row-level security could provide an additional boundary after the design is reviewed.
- **Usage and privacy:** company-level limits, individual session caps, retention choices and explicit recording disclosures. No cross-company model context, recordings or progress sharing by default.

## Later sequence

1. Validate the polished L&L learner and trainer experience.
2. Define one additional industry using entirely fictional data and approved example policies.
3. Approve the tenancy/access design and a migration preserving L&L history.
4. Implement and test isolation before enabling a workspace switcher or invitations.
5. Evaluate hosting, operating costs, real email and providers under a separate approval.

None of those future operations has been performed in this pass. No new deployment, account, paid call, invitation or credential change is needed for the present local UI improvements.
