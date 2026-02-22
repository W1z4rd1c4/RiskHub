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
- `run_release_parity_audit.py`

## Related Commands

```bash
make -f scripts/Makefile security-contract-probe
make -f scripts/Makefile security-gap-round5
make -f scripts/Makefile release-parity-audit
python3 scripts/security/compose_round5_point3_index.py
python3 scripts/security/run_release_parity_audit.py --skip-prod-readiness
```
