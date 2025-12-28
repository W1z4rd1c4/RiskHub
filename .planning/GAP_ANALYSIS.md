# Gap Analysis: RiskHub vs OS 18 Řízení rizik

Analysis of *Organizační směrnice OS 18* reveals critical compliance gaps in the current v1.0 MVP scope.

## 1. Governance & Roles (Missing)
The current system has generic "Department Head" and "Risk Manager" roles. OS 18 mandates specific "Key Functions" with distinct responsibilities and views:
- **Compliance Function**: Monitoring legal changes, policy consistency.
- **Actuarial Function**: Risk limits validation, reserving oversight.
- **Security Manager**: Cyber/ICT risk control (likely DORA/ISO 27001 alignment).
- **Risk Committee**: Specific high-level dashboard for quarterly review.

*Gap: No dedicated views or permission sets for these Key Functions.*

## 2. Risk Appetite & Limits (Missing)
Agent analysis found "Plnění limitů v rámci rizikového apetitu" (Meeting risk appetite limits).
- We have individual Risk Scores (Gross/Net).
- We **lack** a "Risk Appetite Statement" or global limits (e.g., "Max 5 High Risks per Dept" or financial exposure limits).
- We **lack** Dashboard widgets for "Appetite Limit Breaches".

## 3. Regulatory Reporting (Missing)
OS 18 explicitly mentions Solvency II reporting:
- **QRT (Quantitative Reporting Templates)**: Structured data export.
- **RSR (Regular Supervisory Report)**: Narrative + Data.
- **ORSA (Own Risk and Solvency Assessment)**: Annual strategic risk assessment.
- **public communication**: Reports to the supervisor and public.

*Gap: Current Reporting Phase 4 only covers generic Excel/PDF exports, not these specific regulatory formats.*

## 4. Risk Taxonomy (Partial)
OS 18 defines specific "Main Risk Categories" (likely Underwriting, Market, Credit, Operational).
- We have a free-text "Category" field.
- **Gap**: Need a rigid, hierarchical Taxonomy to map risks to Solvency II categories (e.g., "Operational Risk > Internal Fraud").
