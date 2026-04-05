# scripts/install_lib

## Purpose

Stdlib-only Python control plane behind the public `./scripts/install.sh` wrapper.

## Contents

- `cli.py`
  - Argument parsing and top-level command dispatch.
- `common.py`
  - Shared path, prompt, env-file, and command helpers.
- `production.py`
  - Demo/dev/production/upgrade/verify orchestration.
- `status.py`
  - Status payload builders and human output.
- `doctor.py`
  - Doctor payloads and safe repair orchestration.
- `runtime_state.py`
  - `install-state.json` lifecycle metadata helpers.

## Notes

- Keep `scripts/install.sh` as the stable public entrypoint.
- New installer behavior must remain covered by `tests/backend/pytest/test_install_script_contracts.py`.
