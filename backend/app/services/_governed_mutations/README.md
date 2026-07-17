# Governed mutations

This package owns immutable, versioned proposals for protected business
mutations defined by [ADR-016](../../../../docs/adr/ADR-016-governed-mutation-proposals.md).

## Current scope

- `process_identity.py` is the one canonical Process-proposal identity module.
  It owns the writer, strict object parser, and dialect-aware SQL predicate for
  the exact `process.edit` / `process` workflow. SQLite and PostgreSQL parity
  tests require SQL membership to equal parser validity for the same payload.
- `process_updates.py` evaluates both the current and proposed Process CIF
  state for the fixed `protected_process_edit` scenario.
- Protected edits require a reason and an independent active Risk Manager or
  CRO. They create an immutable proposal, impact lock, safe audit event, and
  transactional outbox event instead of mutating the Process immediately.
- A pending impact lock blocks overlapping Process business edits until the
  proposal is applied, rejected, cancelled, or expires as stale.
- When the fixed scenario is disabled, the ordinary Process update lifecycle
  remains the transaction owner and applies the edit directly.
- Proposal dispatch is fail closed. A valid exact Process proposal uses the
  governed path; a row without any proposal may use a legacy path; every
  unsupported or malformed proposal is excluded from both. Unsupported rows
  are absent from queues, counts, inbox operations, notifications, execution,
  and outbox delivery. A malformed exact identity raises at object boundaries
  and cannot be executed or silently reclassified as legacy.

## Boundaries

- Proposal intake and proposal-specific lifecycle behavior belong here.
- Approval queue authorization and projection stay in `_approval_queue` and
  `approval_scenario_policy.py`.
- Notification delivery is triggered through `services/outbox`; notification
  preferences suppress delivery only and never remove approval queue work.
- Service boundaries flush audit facts and commit once through the canonical
  transaction helpers. Endpoint modules must not commit.

Keep this README aligned when another protected resource or mutation kind is
added.
