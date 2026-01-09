# Phase 18: Vendor Risk Management - Context

**Gathered:** 2026-01-08
**Status:** Ready for research

<vision>
## How This Should Work

A comprehensive Vendor Risk Management module that brings together four pillars:

1. **Vendor Catalog** — A registry of all third-party vendors with risk tiers (critical/high/medium/low), risk scores, and assessment schedules. The single source of truth for "who are our vendors."

2. **Assessment Questionnaires** — Structured questionnaires sent to vendors to evaluate their risk posture. Responses collected, scored, and tracked over time.

3. **Supply Chain Visualization** — Understanding dependencies and cascading risk. "If Vendor X fails, what's impacted?" Show critical path dependencies and fourth-party visibility (vendor's vendors).

4. **DORA Compliance Layer** — Track which vendors are DORA-relevant. DORA-relevant vendors get a **different, more exhaustive scope**:
   - Longer questionnaires with more sections
   - More frequent assessment cycles
   - Additional evidence/documentation requirements
   - Specific DORA articles mapped to questions
   - Sub-contractor chain disclosure requirements

DORA-relevant vendors can be identified both manually (flag when adding) and automatically (based on vendor type/category like ICT providers, cloud services, etc.).

</vision>

<essential>
## What Must Be Nailed

- **Vendor registry with tiering** — All vendors catalogued with clear risk classification
- **Assessment workflow** — Ability to send, collect, and score questionnaires
- **DORA differentiation** — Clear separation between standard vs DORA-relevant vendor handling
- **Dependency visibility** — See which processes/risks are affected if a vendor fails

</essential>

<boundaries>
## What's Out of Scope

These are explicitly deferred for future phases:

- **Contract management** — Renewal dates, SLA tracking, cost tracking
- **Vendor performance monitoring** — SLA breach history, incident tracking
- **Automated vendor onboarding workflow** — Approval gates, due diligence checklist automation
- **External data integration** — Pulling scores from BitSight/SecurityScorecard
- **Vendor communication portal** — Vendors logging in to submit questionnaires themselves

</boundaries>

<specifics>
## Specific Ideas

- Use existing PostgreSQL database — add new tables (Vendors, VendorAssessments, VendorRisks) that link to existing Risks, Controls, Departments, Users
- DORA-relevant flag determines which assessment template is used
- Supply chain can be modeled as vendor-to-vendor relationships (parent/sub-contractor)
- Integration with existing Risk entities — vendor risks should appear in the risk register

</specifics>

<notes>
## Additional Context

Currently deferred until after v1.0 MVP production deployment. This is a future release feature.

No specific deadline mentioned — will be scheduled after Phase 17 completes.

</notes>

---

*Phase: 18-vendor-risk*
*Context gathered: 2026-01-08*
