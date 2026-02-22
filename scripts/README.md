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
  - `compose_round5_point3_index.py`
  - `protocol_contract_probe.py`
  - `rbac_idor_write_sweep.py`
  - `real_staging_replay.py`
  - `run_protocol_contract_probe.sh`
  - `run_real_staging_replay.sh`
  - `state_machine_campaign.py`
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

## Round-5 Security Gap Commands

```bash
make -f scripts/Makefile security-redis-resilience
make -f scripts/Makefile security-gap-round5
```

Real staging replay harness:

```bash
bash scripts/security/run_real_staging_replay.sh
```

Round-5 Point-3 consolidated findings index:

```bash
python3 scripts/security/compose_round5_point3_index.py
```

Default output:
`tests/results/security/deep-gap-round5-point3-parity-20260221-230550/findings-round5-point3-parity.json`

## Documentation Topology Audit

```bash
make -f scripts/Makefile docs-tree-audit
python3 scripts/tools/docs_tree_audit.py --scope full
```

Outputs are written under:
`tests/results/docs/docs-tree-audit-<timestamp>/`

## Documentation Topology Consistency Gate

```bash
make -f scripts/Makefile docs-topology-consistency
python3 scripts/tools/structure_metrics_guard.py
python3 scripts/tools/docs_tree_audit.py --scope canonical --max-root-hops 3 --fail-on-unreachable
```

Outputs are written under:
`tests/results/docs/structure-metrics-guard-<timestamp>/`
