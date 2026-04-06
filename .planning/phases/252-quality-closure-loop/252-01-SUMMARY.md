# Plan 252-01 Summary: Audit Log Redaction Hardening

## Completed

- Added `backend/app/core/activity_redaction.py` as the dedicated audit redaction policy module.
- Updated `backend/app/core/activity_logger.py` to:
  - normalize changes first
  - sanitize once before truncation
  - reuse the same sanitized payload for DB persistence and SIEM emission
  - suppress redacted field names in generated descriptions
- Preserved safe structural change logging for fields such as status, IDs, booleans, and selected numeric/process fields.
- Redacted sensitive fields, free text, and unknown fields by default.
- Tightened the follow-up policy so sensitive `*_id` names (for example `session_id` and `authorization_id`) redact before the generic safe-ID heuristic, and opaque payload fields such as `last_error` / `result_json` now redact by default.
- Updated admin/operator docs to clarify that audit change payloads are intentionally redacted.

## Verification

- `cd backend && ./venv/bin/python -m pytest -q ../tests/backend/pytest/test_activity_log.py ../tests/backend/pytest/test_activity_log_redaction.py ../tests/backend/pytest/test_siem_logging.py` -> `23 passed`
- `cd backend && TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_test@127.0.0.1:55432/riskhub_test ./venv/bin/python -m pytest -q ../tests/backend/pytest/test_activity_log.py` -> `18 passed`
- `make -f scripts/Makefile docs-topology-consistency` -> passed

## Notes

- `password_changed` remains persisted as a safe boolean change marker, but its field name is excluded from generated descriptions because it contains a sensitive token fragment.
- Existing tests that previously asserted raw `description` deltas were updated to assert redaction instead.
