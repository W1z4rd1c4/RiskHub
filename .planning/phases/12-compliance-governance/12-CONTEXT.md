# Phase 12: Compliance Governance — Context

## Vision

Two components to enhance governance and compliance visibility in RiskHub.

---

## Component 1: Dashboard Enhancement (Risk Committee View)

Enhance the existing Dashboard tab with Risk Committee functionality:

- **Executive Summary** — High-level risk posture changes since last quarter with drill-downs
- **Quarterly Report Package** — Prepared materials for committee review
- **Meeting Mode** — Projector-friendly presentation layout for live review sessions

---

## Component 2: Activity Log (New Tab)

A new "Activity Log" tab providing complete system-wide change tracking.

### What It Tracks
- **All entities**: Risks, Controls, KRIs, Users, Departments, Approvals, everything
- Every create, update, delete, status change, ownership transfer

### View Modes
- **By Person** — All actions by a specific user
- **By Department** — All changes within a department
- **By Risk** — Complete history of a specific risk
- **By Entity Type** — All changes to Controls, KRIs, etc.
- **Chronological** — Everything, newest first

### Search
- Fulltext search across all change data (descriptions, names, values)

---

## Out of Scope

1. Export/download of the Activity Log
2. Real-time push notifications for changes
3. Retention policies / auto-archiving
4. Side-by-side diff/comparison view

---

## Notes

- **Do NOT modify** the existing Audit Trail tab (control executions) — it stays as-is
- Activity Log is a separate, new navigation item

### Access Control
- **Visibility**: Activity Log tab visible only to Department Leads and Privileged users (CRO, Admin, Risk Manager)
- **Data Scoping**: Department leads see only their department's activity; privileged users see all

---

*Captured: 2026-01-01*
