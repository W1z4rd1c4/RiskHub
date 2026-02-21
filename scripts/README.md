# scripts

## Purpose

Folder for `scripts` implementation assets.

## Contents

- `check_docs_contract.py`
- `dev.sh`
- `dev_test_setup.sh`
- `fix_frontend_auth.py`
- `install_agent_skills_global.sh`
- `Makefile`
- `prod/`
- `run_playwright_with_watchdog.sh`
- `runtime-artifacts/`
- `security/`
  - `protocol_contract_probe.py`
  - `run_protocol_contract_probe.sh`
- `setup-dev.sh`
- `setup.sh`
- `tools/`
- `verify_security_headers.py`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

## Security Probe Command

Run deterministic protocol/contract drift triage:

```bash
make -f scripts/Makefile security-contract-probe
```

Outputs are written under `tests/results/security/contract-drift-remediation-<timestamp>/protocol/`.
