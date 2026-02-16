# Plan 500-05 Summary: Deploy/Upgrade/Rollback Orchestration

## Completed: 2026-02-16

### Scope Delivered

- Added lifecycle orchestration scripts with safe ordering:
  - `deploy.sh` (first install)
  - `upgrade.sh` (records previous image refs as docker labels)
  - `rollback.sh` (containers only, explicit DB downgrade acknowledgement required)
- Added operational convenience scripts:
  - `status.sh`, `logs.sh`, `stop.sh`

### Files Changed

| File | Change |
|------|--------|
| `scripts/prod/deploy.sh` | NEW |
| `scripts/prod/upgrade.sh` | NEW |
| `scripts/prod/rollback.sh` | NEW |
| `scripts/prod/status.sh` | NEW |
| `scripts/prod/logs.sh` | NEW |
| `scripts/prod/stop.sh` | NEW |

### Verification

- `scripts/prod/deploy.sh --backend-env scripts/prod/config/backend.env.example --frontend-env scripts/prod/config/frontend.env.example --tag test --dry-run --yes` → prints expected ordered actions, exits 0
- `make verify-prod-install-scripts` → passed

### Outcome

Operators can deploy and upgrade safely with explicit migrations/bootstrap steps before container replacement, and can roll back containers without attempting automatic database downgrades.

