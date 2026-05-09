# backend/app/services/_issue_workflow

## Purpose

Business/service-layer logic for `_issue_workflow`.

## Contents

- `__init__.py`
- `__pycache__/`
- `assignment.py`
- `closure.py`
- `contracts.py`
- `exceptions.py`
- `execution.py`
- `exception_selection.py`
- `loading.py`
- `outbox.py`
- `remediation.py`
- `service.py`
- `serialization.py`
- `source_validation.py`
- `transitions.py`
- `update_plans.py`

## Notes

Keep this README updated when responsibilities or structure in this folder change. Notification emission is outbox-only: workflow execution creates outbox plans and `backend/app/services/outbox/handlers/issues.py` performs the notification side effects.
