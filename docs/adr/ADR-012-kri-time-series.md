# ADR-012 KRI Time-Series Period Algebra

## Status

Accepted

## Context

KRI value history, deadline notifications, monitoring status, reports, and dashboard trends all depend on the same period algebra. The canonical helper module already exists at `backend/app/services/_kri_history/periods.py`, but the reporting grace window also existed as a duplicate default in `backend/app/services/_config/lookup.py`.

The business contract exposes a five-state `monitoring_status` vocabulary: `new`, `not_submitted`, `breach`, `warning`, and `optimal`. These states are derived from the latest closed required reporting period, not arbitrary historical submissions.

## Decision

KRI period algebra has one implementation home: `backend/app/services/_kri_history/periods.py`.

The canonical helpers are:

- `period_bounds_for_date`
- `latest_closed_period_for_date`
- `is_period_end_boundary`
- `due_date`
- `is_within_reporting_window`

The reporting grace window single source of truth is `backend/app/services/_kri_history/constants.py`:

```python
REPORTING_GRACE_DAYS = 15
```

KRI deadline services and config fallback code import this constant rather than redefining the value. The constant is the fallback/default period-algebra value. `KRIDeadlineService` may use the runtime `global_config.reporting_grace_days` override for notification due-date evaluation and message copy, but if no override exists it falls back to this canonical 15-day value.

The canonical monitoring status vocabulary is:

- `new`
- `not_submitted`
- `breach`
- `warning`
- `optimal`

No additional KRI status vocabulary may be introduced without updating the business logic documentation, API schema tests, and the architecture locks that bind this ADR.

## Alternatives Rejected

- Keeping `REPORTING_GRACE_DAYS` in global config defaults as a second hardcoded value: rejected because it creates silent drift from the KRI period algebra.
- Recomputing period bounds in endpoint or report modules: rejected because it fragments period semantics across read shapes.
- Deriving monitoring status from the latest submission regardless of period: rejected because reporting obligations are period-based.

## Migration Impact

`ConfigDefaults.REPORTING_GRACE_DAYS` is removed. KRI deadline defaults now import the canonical `_kri_history.constants.REPORTING_GRACE_DAYS` value. Runtime override behavior through `global_config` is deadline-service-specific; history recording and monitoring period algebra continue to use the canonical fallback unless a separate product change makes the override globally authoritative.

Existing KRI history and monitoring APIs keep their wire shape. This ADR only consolidates the source of truth and locks duplicate definitions out of `backend/app`.

## Rollback Strategy

Forward-only as a source-of-truth cleanup. If a regression appears, restore behavior by importing `REPORTING_GRACE_DAYS` from `_kri_history.constants.py` at the affected call site rather than reintroducing duplicate constants.

## Invariant Tests

- `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py` forbids duplicate definitions of the canonical period helpers outside `_kri_history/periods.py`.
- The same lock forbids duplicate `REPORTING_GRACE_DAYS = 15` definitions outside `_kri_history/constants.py`.

## ADR Cross-References

- ADR-002: KRIDeadlineService is a transaction-owning service entrypoint per the service-owned-transactions decision.
- ADR-007: classifies KRI history as the bounded context for KRI time-series period logic.
- ADR-008: establishes the single-source-of-truth pattern used here.
- ADR-009: governs reserved compatibility surfaces if old KRI aliases are retained temporarily.
