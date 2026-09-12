# scripts/install_lib

## Purpose

Stdlib-only Python control plane behind the public `./scripts/install.sh` wrapper.

## Contents

- `cli.py`
  - Argument parsing and top-level command dispatch.
- `common.py`
  - Shared path, prompt, env-file, and command helpers.
- `production_identity.py` resolves the operator choice and preserves the installed tuple.
- `identity_diagnostics.py` reads safe runtime diagnostics and checks onboarding completion.
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

The native preparation option is `--user-management custom`, with required MFA by
default or explicit `--mfa-policy optional`. Doctor does not scaffold missing
production secrets or change identity authority. Runtime diagnostics distinguish
delivery degradation, security unavailability and pending account enrollment.
Source production admission remains closed until #208.
