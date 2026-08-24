# Project State Snapshot: RiskHub

> **Authority boundary:** This file is a versioned technical snapshot for the
> commit that contains it. It is not a live delivery tracker. Current scope,
> assignment, priority, blocking, review state, acceptance evidence, and closure
> must be read from the applicable GitHub Issue, pull request, or Project item.
> See [`docs/DOCUMENTATION_OWNERSHIP.md`](../docs/DOCUMENTATION_OWNERSHIP.md).

## Product Context

RiskHub is an enterprise risk-management platform for insurance companies. Its
core product scope includes control and risk registers, KRIs, vendors,
approvals, reporting, role-based access, dashboards, localization, and
Docker/Linux deployment.

## Versioned Position Snapshot

The historical planning material consolidated into this snapshot described:

- milestone intent: `v1.0 MVP`;
- broad completion of the foundation, catalog, dashboard, reporting, testing,
  governance, issue, assessment, deployment, vendor, localization, audit, and
  architecture-deepening waves;
- historically deferred work in Phase 19 and Phase 70;
- a historical `2/3` snapshot for the standalone Phase 90 AD Emulator;
- Phase 254 architecture deepening recorded on 2026-05-03.

These statements describe repository planning history only. They do not assert
that an item remains active, assigned, blocked, or incomplete today.

## Where Detail Lives

- Product and repository context: [`PROJECT.md`](./PROJECT.md)
- Commit-scoped roadmap intent: [`ROADMAP.md`](./ROADMAP.md)
- Historical plans and summaries: [`phases/README.md`](./phases/README.md)
- Architecture and repository maps: [`codebase/`](./codebase/)
- Durable decisions: [`docs/adr/`](../docs/adr/)
- Live delivery state: GitHub Issues, pull requests, and Projects

## Reconciliation Rule

When this snapshot differs from a live GitHub item, GitHub controls delivery
state. When it differs from code, tests, migrations, or runtime configuration,
those artifacts establish implemented behavior for the referenced commit. A
future planning reconciliation may update this file, but must not use it as a
substitute for live work tracking.
