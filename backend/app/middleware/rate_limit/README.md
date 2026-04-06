# backend/app/middleware/rate_limit

## Purpose

Rate-limit middleware split into policy, backend, response, and middleware assembly modules.

## Contents

- `__init__.py`
- `backend.py`
- `middleware.py`
- `policy.py`
- `responses.py`

## Notes

- Keep request classification, backend storage, and response shaping separated.
- Preserve existing production/runtime contract behavior documented in rate-limit tests before changing module boundaries.
