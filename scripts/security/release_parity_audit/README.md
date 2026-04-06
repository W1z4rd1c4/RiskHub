# scripts/security/release_parity_audit

## Purpose

Package-backed release parity audit harness.

## Contents

- `audit.py`
  - Main `ReleaseParityAudit` implementation.
- `cli.py`
  - Argument parsing and command-line entrypoint.
- `types.py`
  - Shared result dataclasses.

## Notes

- `scripts/security/run_release_parity_audit.py` remains the thin public wrapper used by CI and local commands.
