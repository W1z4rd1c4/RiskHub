---
phase: 14-risk-assessments
updated: 2026-01-24
---

# Phase 14 Context: Risk Assessments (Questionnaires)

## Product requirement (user-provided)
- Implement a **per-risk** questionnaire flow (“risk assessment questionnaire”).
- **Start/send**: Risk Manager or CRO.
- **Submit**: Risk Owner or Department Head.
- **View**: anyone who can access the risk.
- **Lifecycle**: `sent` → `in_progress` → `submitted` (no edits after submit).
- **Due date**: 15 days after send; reminders at 7 days before due; overdue handling + badges.
- **Notifications**: in-app only:
  - To assignee: sent, due-soon, overdue
  - To Risk Manager + CRO: submission
- **Risk Detail UI**: add a 3rd tab next to **Overview** and **KRI History** to show:
  - Current questionnaire status + actions
  - History grid/table of questionnaires (most recent first)
- **CRO batch send**: in **Risk Hub** page, a new tab next to existing config tabs that:
  - lists risks with filters (department/process/category/etc.)
  - supports row selection + select-all
  - sends questionnaires in batch
- **Localization**: EN + CS.
- **Activity Log**: log at least “sent” and “submitted”.

## Scope guardrails (assumptions)
- At most **one open** questionnaire per risk (enforced in service logic).
- Questions are a fixed “v1” set keyed for localization (templates/versioning kept minimal but future-proofed).

