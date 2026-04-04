# scripts/security

## Purpose

Security audit and remediation harnesses used for deterministic local/staging-sim replay and closure evidence generation.

## Key Entrypoints

- `run_protocol_contract_probe.sh`
- `protocol_contract_probe.py`
- `run_real_staging_replay.sh`
- `real_staging_replay.py`
- `state_machine_campaign.py`
- `rbac_idor_write_sweep.py`
- `compose_round5_point3_index.py`
- `run_public_repo_leak_audit.sh`
- `run_release_parity_audit.py`

## Related Commands

```bash
make -f scripts/Makefile security-contract-probe
make -f scripts/Makefile security-gap-round5
make -f scripts/Makefile public-leak-audit
make -f scripts/Makefile release-parity-audit
python3 scripts/security/compose_round5_point3_index.py
python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts> --skip-prod-readiness
python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts>
```

## Release Parity Audit

- Tool: `scripts/security/run_release_parity_audit.py`
- Make target: `make -f scripts/Makefile release-parity-audit`
- Fast rerun loop command:
  - `python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts> --skip-prod-readiness`
- Full gate command:
  - `python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts>`
- Artifact root pattern:
  - `tests/results/release-parity-audit-<run-id>/`
- Required evidence files:
  - `report.md`
  - `decision.json`
  - `findings.json`
  - `matrix.json`
  - `fingerprints/runtime.json`
  - `deps/diffs.json`
  - `ui/parity.json`
- Release bar for this cycle: `GO` requires `P0=0`, `P1=0`, `P2=0`.
- Local prerequisite: Node major `24` for parity with CI/Docker startup paths.
