# backend/app/services/_monitoring_status

## Purpose

Shared backend derivation package for canonical control and KRI monitoring
status, including typed result objects and config-backed thresholds.

## Contents

- `__init__.py`
- `config.py`
- `controls.py`
- `kris.py`
- `types.py`

## Notes

This package is the source of truth for monitoring-status derivation used by
API serializers, filters, stats, and exports. UI code should consume the
derived status fields from API responses rather than reimplementing the rules.
`backend/app/services/_monitoring_response.py` is the file-level read-shape
complement that serializes these derived facts into API response payloads.
