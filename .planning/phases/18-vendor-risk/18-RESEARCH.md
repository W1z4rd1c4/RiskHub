# Phase 18 Research: Vendor / Third-Party Risk Management (VRM/TPRM)

## Goal (from roadmap + user request)
Build a **Vendor Risk Management** module that supports end‑to‑end third‑party risk governance: vendor catalog, due diligence, risk assessment/scoring, ongoing monitoring, reporting, and DORA‑relevant tracking — with “real” process fidelity based on **PI‑18‑03 Řízení rizik třetích stran (Leden 2025)**.

## Source: PI‑18‑03 (process requirements distilled)

Terminology note for implementation:
- PI‑18‑03 uses “sponzor dodavatele” (vendor sponsor / contract owner). In RiskHub Phase 18 we model this as **outsourcing owner** (single owner field).

### Scope & cadence
- Applies to *all* third parties that may impact financial stability, reputation, regulatory compliance, or operational continuity (incl. IT/cloud, outsourced business processes, advisors/auditors, strategic partners).
- The process is reviewed at least **annually** (manager risk), and material changes require board approval.

### Key objectives (what the system must enable)
- **Identify & assess** third‑party risks (financial stability, operational resilience, regulatory compliance, cyber security).
- **Mitigate & control** via contractual clauses, security measures, and control mechanisms; maintain incident response/mitigation plans.
- **Monitor & audit** performance and risk profile continuously; perform internal/external audits; evaluate compliance over time.
- **Data protection & security** controls (access control, encryption, awareness/training).
- **Business continuity** integration (BCP/DR), including alternatives and crisis readiness.

### Materiality / significance (vendor criticality)
- Materiality threshold is defined as **> 4% impact into own funds** (vlastní kapitál).
- A vendor is “significant” if worst‑case impact exceeds this threshold.
- Significance assessment is owned by the **vendor sponsor** (first line) based on risk analysis.

### Governance model (3 lines of defense)
- **1st line**: operational ownership in departments (department head / outsourcing owner / **vendor sponsor / ICT vendor sponsor**; compliance officer provides methodological support; security specialist manages cyber/tech risks).
- **2nd line**: **Risk Manager + Compliance** coordinate and oversee framework effectiveness; propose limits (aligned with risk appetite), define escalation, monitor limit adherence and report to risk committee/board.
- **3rd line**: internal audit independently reviews the process (at least once per **3 years**), reports severity and remediation deadlines; tracks remediation execution.

### Risk taxonomy (minimum categories)
PI‑18‑03 enumerates at least:
- Regulatory & legal (GDPR/DORA/Solvency II, unclear SLA/liability, third‑country outsourcing)
- Information security & data protection
- Cyber attacks & supply‑chain compromise
- Operational continuity (BCP/DRP, outages)
- Service quality/performance (SLA/KPI, flexibility)
- Financial (insolvency, hidden costs, fraud/accounting)
- Strategic & reputational (ESG/ethics, transparency)
- Governance & oversight (weak due diligence, lack of audits/controls)
- Technology dependence (lock‑in, interoperability, data portability)
- Human factor (key personnel dependency, insider threats)

### Concentration risk checks (DORA‑aligned)
Before contracting for ICT services supporting **critical/important functions**, evaluate whether it causes:
- reliance on a provider that is *hard to replace*, or
- multiple critical/important ICT arrangements with the *same* or closely connected providers.

### Due diligence & assessment evidence
- Sponsor validates vendor via public information (business registry, annual reports, reputation, etc.) and a **control questionnaire**.
- Output of assessment becomes part of inputs to the **risk committee**, which recommends whether to engage the vendor.
- Re‑assessment cadence:
  - **critical/important function vendors**: at least **1x/year**
  - other vendors: at least **1x/3 years**
  - plus re‑assessment on major incidents or new external threats affecting the process.

### Exit strategy & contingency planning
For vendors supporting critical/important functions:
- mandatory **exit strategy** (steps/roles to avoid service disruption or regulatory breach).
- evaluate outage impact on availability/resilience of supported functions.
- if outage risk implies > **24 hours** process outage or impacts data CIA (confidentiality/integrity/authenticity/availability), sponsor must prepare a **contingency plan**; it must tie into broader BCP documentation.

### Contract requirements (ICT vendors)
- Contracts must explicitly define rights/obligations; PI references OS‑16 outsourcing rules and DORA addenda (significant/non‑significant ICT services).
- Practical implication for RiskHub: store structured “contract control requirements” and evidence links, even if the PDF leaves exact clause text to referenced templates.

### Monitoring & reporting
- Sponsor continuously evaluates deliveries, contractual compliance, and regulatory compliance; on severe deficiencies triggers mitigation steps (amend contract, refine working processes, start exit strategy).
- Documentation refresh cadence mirrors reassessment cadence (yearly for critical/important; 3‑year for others).
- Annual management report (risk manager) should include at least:
  - list of vendors, identifying which support critical/important functions
  - vendor sponsor per vendor
  - date of last documentation review
  - major breaches of contract/regulation
  - major security/operational incidents caused by ICT vendor
  - evaluation of ICT vendor management process + proposals for updates

### Register of information (DORA)
- PI references the DORA “Register of Information” template (EU implementing regulation) and states **Compliance maintains the vendor register of information**.
- Practical implication: RiskHub should model/export a DORA‑compatible register dataset (even if only partially at first).

## Product mapping (RiskHub → TPRM capabilities)

### Core entities to represent the PI requirements
- Vendor (third party) + vendor sponsor (contract owner) + vendor category/type
- Provided services + whether they support critical/important functions
- Risk assessment records (questionnaire + scoring + evidence) + reassessment schedule
- Risk items per vendor aligned to the PI taxonomy (incl. concentration/replaceability)
- Controls/mitigations, incidents, action items/remediation, and audit findings
- Exit strategy & contingency plan artifacts (links/attachments + status)
- Annual reporting views + DORA register export

### Where “third‑party integrations” naturally fit
PI‑18‑03 requires verification of public information and continuous monitoring. RiskHub can support this with integrations like:
- public company registry lookups / document evidence capture
- cyber risk rating providers (optional)
- sanctions/PEP screening (optional)
- incident monitoring feeds (optional)
These can be introduced behind a connector abstraction so the core process still works without external vendors.

## Planning implications (how to break Phase 18 down)
Phase 18 should be decomposed beyond “vendor DB + assessments” into plans that cover:
1) governance/data model foundations, 2) taxonomy & scoring, 3) due diligence workflow, 4) reassessment scheduling, 5) exit/BCP artifacts, 6) monitoring + incidents + remediation, 7) reporting + exports (incl. DORA register), 8) permissions/RBAC mapping, 9) auditability/activity logs, 10) optional connector framework for 3rd‑party signals.
