# backend/app/services/_issue_register

## Purpose

Internal issue register helpers for list grouping, linked-context expansion, and redacted collection summaries.

## Contents

- `grouping.py` - issue group definitions, context subqueries, fallback labels, and group filter helpers.

## Notes

HTTP routes under `backend/app/api/v1/endpoints/issues/` should adapt request/response concerns and delegate shared register behavior here.
