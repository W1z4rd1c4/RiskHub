# backend/app/services/_issue_register

## Purpose

Internal issue register helpers for list grouping, linked-context expansion, and redacted collection summaries.

## Contents

- `constants.py` - `UNKNOWN_*_LABEL` strings and `source_type_value` coercer (canonical).
- `grouping.py` - issue group definitions, context subqueries, fallback labels, and group filter helpers.
- `source_mutation.py` - canonical owner of vendor/department resolution and IssueLink department aggregation.

## Notes

HTTP routes under `backend/app/api/v1/endpoints/issues/` should adapt request/response concerns and delegate shared register behavior here.
