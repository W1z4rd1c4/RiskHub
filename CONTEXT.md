# ICT Register

The in-app system of record for the entity's ICT operational-resilience register —
its business processes, ICT assets, third-party vendors, and the risks and threats
around them — reproducing the functionality of the DORA *"registr aktiv a dodavatelů"*
workbook. (Module name provisional; to be reconfirmed after the Register-of-Information
legal review.)

## Language

### Registers

**Process**:
A business function in the L0/L1/L2 hierarchy; the point where criticality is assessed and from which it cascades downward.
_Avoid_: activity, capability, function (reserve "function" for CIF)

**L0 / L1 / L2**:
The three levels of the process hierarchy — L0 the top area (*oblast*), L1 the process, L2 the sub-process.
_Avoid_: tier, level (ambiguous), layer

**Asset**:
An ICT asset that supports one or more Processes; its criticality and CIF support are derived, never entered by hand.
_Avoid_: system, application, resource, component

**Vendor**:
An ICT third-party service provider — RiskHub's existing `Vendor`, now the register's provider record.
_Avoid_: supplier, provider, third party, dodavatel

**Contract**:
A contractual arrangement with a Vendor for ICT services; owned within the Vendor domain, not a standalone page.
_Avoid_: agreement, deal, smlouva, contractual arrangement (DORA's own term)

**Sub-outsourcing**:
A Vendor's own downstream providers — the fourth-party supply chain; owned within the Vendor domain.
_Avoid_: subcontracting, fourth party, subdodávka

**Threat**:
A source or cause that can give rise to a Risk; a first-class register with its own page.
_Avoid_: hazard, hrozba, vulnerability

**Threat Steward**:
The Accountable owner responsible for maintaining a Threat record; the Steward must be an active User holding the CISO role, and stewardship does not imply ownership or control of the threat itself.
_Avoid_: threat owner, threat assignee

**CISO**:
The Chief Information Security Officer role accountable for stewardship of the Threat register and oversight of ICT-security risk information.
_Avoid_: security admin, threat owner

**Risk**:
An ICT risk — RiskHub's existing `Risk`, linked to the Processes, Assets, and Vendors it concerns.
_Avoid_: issue, exposure

### Responsibility

**Process Owner**:
The Accountable owner for a Process and its business-continuity assessment.
_Avoid_: process responsible, free-text owner

**Business Owner**:
The Asset responsibility role accountable for the business purpose and business impact of an Asset.
_Avoid_: asset owner (ambiguous), sponsor

**ICT Owner**:
The Asset responsibility role accountable for the technical lifecycle and operation of an Asset.
_Avoid_: technical contact, administrator

**Outsourcing Owner**:
The Accountable owner for RiskHub's relationship and governance responsibilities concerning a Vendor.
_Avoid_: vendor owner, supplier manager

### Criticality & derivation

**Critical or Important Function (CIF)**:
DORA's designation for a function whose disruption would materially impair the entity; support for a CIF is propagated onto Assets and Vendors by any-true (OR), never entered manually.
_Avoid_: critical function, important function, CIF flag

**Criticality class**:
The banded criticality of a Process (*třída kritičnosti*), and by derivation of its Assets and Vendors.
_Avoid_: criticality level, severity, tier

**Criticality cascade**:
The downward propagation Process → Asset → Vendor → Sub-outsourcing — criticality rank by MAX, CIF support by any-true.
_Avoid_: rollup, aggregation, inheritance

**Vendor tier**:
The derived supplier class — Critical / Significant / Standard (*Kritický / Významný / Standardní dodavatel*) — computed from CIF support, the max criticality of linked Assets, substitutability, and S17–S19 service presence.
_Avoid_: vendor class, vendor rating, criticality (reserve for Process)

**Substitutability**:
How replaceable a Vendor is — easy / hard / not substitutable (*nahraditelnost*).
_Avoid_: replaceability, swappability (note: current `Vendor.replaceability` field)

### Regulatory

**Register of Information (RoI)**:
The DORA-mandated report on ICT third-party contractual arrangements (Reg. (EU) 2022/2554, Art. 28(3); 15 templates in Commission Implementing Reg. (EU) 2024/2956, in force 22 Dec 2024) that this register must be able to populate; producing the submission file itself is out of scope.
_Avoid_: DORA register, RoI export, information register

**ICT service**:
A service a Vendor provides, typed by the DORA ICT-service taxonomy (S-codes).
_Avoid_: service type, offering

**F-code**:
The RoI function identifier carried by a Process (RoI template B_06.01).
_Avoid_: function code

**S-code**:
An ICT-service-type code from the DORA taxonomy — a closed list, S01–S19 (S17–S19 = cloud IaaS/PaaS/SaaS).
_Avoid_: service code

**Rank**:
The depth of a provider in the ICT subcontracting supply chain — rank 1 is the direct Vendor, rank 2+ its sub-outsourcers (RoI template B_05.02).
_Avoid_: level, depth, tier

**LEI**:
The Legal Entity Identifier used to key entities and providers across the RoI; EUID is the fallback where no LEI exists.
_Avoid_: entity id, company id

### Surfaces & structure

**ICT Committee**:
The CRO / Risk-Committee read-model that aggregates the register, reproducing the workbook's Dashboard and CRO-overview views. Rendered as a URL-addressable Dashboard tab at `/?view=ict-committee` (sibling to the Risk Committee tab), gated on `ict_committee:read`; the legacy standalone `/ict-register/committee` path now redirects there (FR-P4-3/4, #64).
_Avoid_: CRO dashboard, committee dashboard, ICT dashboard, "ICT Risk Committee" (use "ICT Committee")

**Risk Committee**:
The existing Dashboard tab presenting the enterprise risk-committee view; distinct from the ICT Committee, which is scoped to the ICT operational-resilience register. Always qualify which committee is meant.
_Avoid_: committee (unqualified — ambiguous between Risk and ICT)

**Link relation**:
A typed many-to-many connection between register entities (Process↔Asset, Asset↔Asset, Asset↔Vendor, Process↔Vendor).
_Avoid_: mapping, association, join

**Controlled register value**:
A value from an authoritative ICT Register taxonomy whose meaning is independent of the language used to display it; its label follows the user's active locale, while source-format terminology is reserved for import and regulatory export.
_Avoid_: verbatim workbook value, translated data

**Accountable owner**:
The single active RiskHub User assigned to a defined responsibility role for a register record; organizational ownership by a Department remains separate.
_Avoid_: free-text owner, co-owner, participant, contributor, watcher

**Owning Department**:
The single organizational unit accountable for a Process, Asset, Risk, Control, or Vendor; it is distinct from the record's Accountable owner.
_Avoid_: owner department text, team, business unit (unless it is the canonical Department)

**Protected record**:
A Process, Asset, or Vendor whose current or proposed derived classification crosses the governance threshold that requires approval for business-state mutations. The thresholds are Process CIF Yes; Asset CIF Yes or resulting criticality Critical; and Vendor tier Critical or Significant.
_Avoid_: important record, sensitive record, high-risk record

**Pending mutation**:
An immutable, auditable proposal to create, change, link, archive, or reassign a governed record; it does not alter the effective operational state until an eligible independent approver accepts it.
_Avoid_: draft edit, staged row, temporary record

**Accountability reassignment**:
An atomic change to an Accountable owner or Owning Department; it never temporarily clears a required responsibility and follows its configured approval scenario.
_Avoid_: owner replacement, ownership transfer, reassignment without qualification

**Composite approval**:
One approval request that captures a primary mutation and every protected downstream impact produced by the Process-to-Asset-to-Vendor Criticality cascade, applied or rejected as one unit.
_Avoid_: bulk approval, chained approvals, partial approval

---

_Decisions, open questions, and reference material for this effort are captured in
[docs/dora-ict-register/GRILLING-CAPTURE.md](docs/dora-ict-register/GRILLING-CAPTURE.md);
frontend design/UX remediation decisions in
[FRONTEND-UX-REMEDIATION-CAPTURE.md](docs/dora-ict-register/FRONTEND-UX-REMEDIATION-CAPTURE.md),
backed by the audit ledger
[FRONTEND-UX-AUDIT-2026-07-11.md](docs/dora-ict-register/FRONTEND-UX-AUDIT-2026-07-11.md) and
the review-verification note
[UX-REMEDIATION-VERIFICATION-2026-07-11.md](docs/dora-ict-register/UX-REMEDIATION-VERIFICATION-2026-07-11.md) —
all kept out of this glossary per the CONTEXT.md format._
