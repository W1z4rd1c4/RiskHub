# Research: Phase 7 Compliance Governance

## Domain Overview: Solvency II & CNB OS 18

Insurance risk governance is primarily driven by the **Solvency II Directive** (EU) and **Czech National Bank (ČNB) General Guidelines** (specifically OS 18 related to underwriting and technical reserves).

### Solvency II Three Pillars
1.  **Pillar I**: Quantitative (SCR/MCR ratios, capital models).
2.  **Pillar II**: Qualitative (Governance, Risk Management System, ORSA).
3.  **Pillar III**: Disclosure (SFCR - public, RSR - regulatory).

### Risk Committee Dashboard Must-Haves
Based on SFCR analysis and consulting best practices (Deloitte/EY/PwC/KPMG):

| Category | Typical Metrics | Source in RiskHub |
|----------|-----------------|-------------------|
| **Solvency Position** | SCR Ratio, MCR Ratio, Own Funds | *Needs new model* |
| **Risk Profile** | Aggregated Risk Scores by Solvency II type | `Risk` model (Category mapping) |
| **Risk Appetite** | KRI Breach Status, Trend analysis | `KRI` model |
| **Control Health** | Effectiveness % by department, Audit gap | `Control` + `Execution` models |
| **Compliance** | Overdue reviews, Missing justifications | `Audit trail` |

## OS 18 (ČNB) Specifics
- Focuses on **proportionality**: The system must match the insurer's complexity.
- Requires a "Concept of risk management" specifically for underwriting and technical reserves.
- Mandates regular reporting to the Board/Committee on risk limits and technical reserve adequacy.

## Key Findings from Web Research
- **SFCR Disclosures**: Always include a section on "System of Governance" where the Risk Committee's role is described.
- **Consulting Recommendations**: Dashboards should transition from "Red/Amber/Green" (RAG) status to "Actionable Insights" (Why is it red? What is the remediation plan?).
- **Dashboard Pitfalls**: Overwhelming executives with individual risks. Need for **aggregation** and **exception reporting**.

## CNB Governance Agenda (OS 18 Alignment)
Based on ČNB reporting requirements, the automated dashboard should track:
- **KRI Breach Justifications**: Direct link from breach notifications to committee commentary.
- **Control Effectiveness Sign-offs**: Aggregate execution status by department owner.
- **Strategic vs Operational Risk Split**: Separation of high-level strategic risks from day-to-day operational issues.

## Dashboard Schema Proposal
A `CommitteeDashboardResponse` should include:
- `solvency_metrics`: { scr_ratio: float, mcr_ratio: float, as_of: date }
- `risk_profile_solvency_ii`: { underwriting: int, market: int, credit: int, operational: int, liquidity: int }
- `appetite_summary`: { total_kris: int, green: int, amber: int, red: int }
- `compliance_status`: { overdue_controls: int, pending_executions: int }

## UI Component Strategy
- **Executive Summary Card**: Top-level Solvency II Pillar I metrics.
- **Trend View**: 4-quarter historical view of Net Risk Scores and KRI breaches.
- **Drill-down**: Ability to click a "Solvency II Category" and see top 3 contributing risks.
- **Quarterly Freeze**: A button for CROs to "capture" the dashboard state for the official committee minutes.
