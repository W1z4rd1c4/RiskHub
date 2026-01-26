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
- **Process fidelity** — Outsourcing owner accountability (PI “sponsor”), reassessment cadence, and annual reporting consistent with PI-18-03
- **Exit/BCP readiness** — Exit strategy + contingency plan artifacts for critical/important vendors

</essential>

<decisions>
## Locked Implementation Decisions (A–G)

**A) Vendor classification rules**
- **Vendor risk scoring is simple:** single `vendor.risk_score_1_5` (1–5), fully manual.
- **Financial-loss context:** reuse the same “impact → financial range” mapping already used for Risks (total assets config). Vendor score uses the same user-facing scale/ranges for interpretation.
- **Boolean flags per vendor (manual):**
  - `supports_important_core_insurance_function` (yes/no) (aka PI “supports critical/important function”)
  - `dora_relevant` (yes/no)
  - `is_significant_vendor` (yes/no) — **fully manual** (no auto materiality calculation)
- **No inherent vs residual split** for vendor score in MVP.

**B) Ownership + access model**
- **Single owner field:** `outsourcing_owner_user_id` (this corresponds to PI “sponsor dodavatele”; do not model a second sponsor field).
- **Scope like Risks:** vendor belongs to exactly **one** department and one “process” (same structure as Risk detail; do not model multi-department ownership in MVP).
- **Creation/editing:** Department Heads can create vendors; anyone with `vendors:write` can edit vendors **within their department**; the `outsourcing_owner_user_id` can also edit (mirrors “risk owner” exception).
- **Reading:** users with `vendors:read` can view vendors read-only, but **department-scoped by default**; cross-department access aligns with existing code patterns (e.g., `AccessScope.GLOBAL` users and ownership exceptions).

**C) Evidence handling**
- **No file uploads in Phase 18 MVP.** Evidence is stored as an `evidence_reference` string (URL/path), same spirit as Controls evidence usage.
- **Evidence requirement:** follow the “controls” approach — evidence is supported and encouraged but not universally hard-required at input time.
- **Simplicity:** a single evidence text field (no typed evidence taxonomy in MVP).
- **Immutability:** once an assessment is submitted, its `answers_json` + `evidence_reference` are frozen (immutable snapshot). Workflow metadata (`reviewed_at`, `decision_at`, reviewer/decider IDs, recommendation fields) remains writable as the workflow progresses.

**D) Risk Register integration**
- **No automatic enterprise Risk creation** for every vendor. Vendor module is separate.
- **Linking:** vendors can be linked to **multiple** enterprise Risks (many-to-many).
- **Controls:** vendors can have assigned Controls (references/mitigations), but they do **not** automatically change `vendor.risk_score_1_5` in MVP.
- **SLA:** vendors track SLA similarly to KRI (time series + breach tracking + reminders). SLA breaches do not automatically change vendor score in MVP.

**E) Notifications + deep linking**
- Vendor-related notifications always store `resource_type="vendor"` and `resource_id=<vendor_id>`.
- Frontend routing is derived from `notification.type` (not extra DB fields), e.g. `/vendors/:id?tab=sla|schedule|assessments`.

**F) Auditability + roles**
- **Activity log:** Phase 18 follows existing RiskHub audit patterns (see `docs/BUSINESS_LOGIC.md` §9 and existing `risk_questionnaire` / `kri_value` entity types):
  - Add distinct `ActivityEntityType` values for VRM sub-entities (at minimum: `vendor`, `vendor_assessment`, `vendor_incident`, `vendor_sla`, `vendor_remediation`) so Activity Log filtering remains meaningful.
  - Use `entity_id` = the sub-entity’s own ID (e.g., `VendorAssessment.id`), and scope by `department_id = vendor.department_id`.
- **Roles:** Phase 18 assumes “legal” responsibilities are handled by the Compliance Officer role in this deployment.
  - Implement this as a permission capability: `vendor_contracts:read|write` granted to `compliance` (Plan 18-00).
  - Avoid adding a separate `legal` role unless a specific customer requires it.

**G) Approvals (explicitly deferred)**
- Phase 18 v1 does **not** extend the ApprovalRequest workflow to Vendors.
- Vendor CRUD is governed by RBAC (`vendors:*`) + department scoping + outsourcing-owner exception, and by the Vendor Assessment workflow (Plan 18-03) for governance decisions.
- If later required, approvals for vendor deletion / sensitive fields will be implemented as a follow-up plan (new ApprovalResourceType values, UI integration, and BUSINESS_LOGIC update).

</decisions>

<boundaries>
## What's Out of Scope

These are explicitly deferred for future phases:

- **Full contract management** — Renewals, commercial terms, cost tracking (but clause/evidence tracking is in-scope)
- **Full vendor portal** — Vendors logging in as first-class users (assessments can start as export/import or link-based submission)
- **Deep procurement workflows** — RFP tooling, bidding, vendor financial negotiations

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
