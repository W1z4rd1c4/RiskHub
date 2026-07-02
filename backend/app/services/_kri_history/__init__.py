"""KRI history bounded context (write-side, workflow-paired with `_deadline_execution`).

Import the public API from the owning modules directly —
`app.services._kri_history.service.KRIHistoryService` and
`app.services._kri_history.constants.REPORTING_GRACE_DAYS`. The package init
stays import-free because `_monitoring_status` imports `periods` from here at
module load; eager re-exports would close an import cycle.
"""
