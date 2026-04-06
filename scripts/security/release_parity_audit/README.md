# scripts/security/release_parity_audit

## Purpose

Release-parity audit control plane split out of the legacy monolithic runner.

## Contents

- `__init__.py`
- `audit.py`
- `cli.py`
- `types.py`

## Notes

- `cli.py` is the command entrypoint wrapper.
- `audit.py` owns orchestration and report generation.
- Keep CLI behavior compatible with `scripts/security/run_release_parity_audit.py` callers and contract tests.
