# backend/app/services/outbox/handlers

## Purpose

Per-domain transactional outbox handlers.

## Contents

- `approvals.py`
  - Approval request notification handlers.
- `issues.py`
  - Issue assignment and exception notification handlers.
- `questionnaires.py`
  - Questionnaire send/submit/clarification notification handlers.
- `common.py`
  - Shared handler type and user-permission loader helpers.

## Notes

- Keep domain-specific notification rules inside the matching module instead of rebuilding a new handler monolith.
- Retry vs dead-letter policy is owned by `backend/app/services/outbox/dispatcher.py`, not by these handler modules.
- Domain handler modules are registered through the outbox registry; do not move handler selection logic back into one large dispatcher file.
- Shared payload/notification helpers belong in `common.py` only when they are genuinely cross-domain.
