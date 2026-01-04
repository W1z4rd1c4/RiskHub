# Phase 200: Entity Naming Enforcement

## Context & Discovery
**Objective**: Ensure every KRI, Risk, and Control has a mandatory "Name" field and valid values, and update all UI wizards and tables to display this name prominently.

### Current State Analysis

1.  **Risk Model**:
    *   **Missing `name` field.**
    *   Current identifiers: `risk_id_code` (unique), `process` (mandatory), `description` (mandatory).
    *   **Action Required**: Add `name` column (String 255), backfill existing data, expose in API, update UI.

2.  **Control Model**:
    *   Has `name` field (`Mapped[str]`, not nullable).
    *   **Action Required**: Ensure prominent display in all tables/wizards. Verify validation.

3.  **KRI Model**:
    *   Has `metric_name` field (`Mapped[str]`, not nullable).
    *   **Missing `description` field.**
    *   **Action Required**: Add `description` column (Text), expose in API, add to Form (below Name), ensure prominent display. Consistently label `metric_name` as "KRI Name" or "Metric Name".

### Scope of Changes
This is a comprehensive cross-cutting change affecting:
-   **Database**: Schema migration for Risks.
-   **Backend**: API schemas and Services for Risks. Exports (PDF/Excel).
-   **Frontend**:
    -   Types/Interfaces.
    -   Forms/Wizards (Creation & Edit).
    -   List Tables (Columns, Sorting, Filtering).
    -   Detail Pages (Headers, Breadcrumbs).
    -   Modals (Selection/Linking).
    -   Dashboards (Widget labels).

### Plan Breakdown (10 Plans)

*   **200-01**: Database Schema & Migration (Risk Name)
*   **200-02**: Backend API & Logic Updates (Risk Name)
*   **200-03**: Frontend Risk List & Table Updates
*   **200-04**: Frontend Risk Wizard & Form Updates
*   **200-05**: Frontend Risk Details & Linkage Components
*   **200-06**: KRI Naming Consistency (UI/UX)
*   **200-07**: Control Naming Consistency (UI/UX)
*   **200-08**: Export & Reporting Updates (PDF/Excel)
*   **200-09**: Verification & Regression Testing
*   **200-10**: Final Cleanup & Documentation
