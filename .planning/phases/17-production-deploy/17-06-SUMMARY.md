# Summary: Plan 17-06 VM Deployment Scripts (Ex-Post Closeout)

## Completed: 2026-02-16

## Closeout Decision

Plan `17-06` is closed as **superseded**. The original deliverable targeted a legacy `deploy/` layout (systemd + nginx + install scripts), while the repository now ships a stronger production-grade deployment system under `scripts/prod/` delivered by Phase 500.

## Superseding Implementation

- Production deployment orchestration exists in `scripts/prod/deploy.sh`, `scripts/prod/upgrade.sh`, `scripts/prod/rollback.sh`, `scripts/prod/status.sh`, `scripts/prod/logs.sh`, and `scripts/prod/stop.sh`.
- Preflight and safety checks exist in `scripts/prod/preflight.sh`, `scripts/prod/lib/preflight.sh`, and `scripts/prod/lib/common.sh`.
- Environment templates and config guidance exist in:
  - `scripts/prod/config/backend.env.example`
  - `scripts/prod/config/frontend.env.example`
  - `scripts/prod/config/README.md`
- Deployment/operations docs exist in `docs/deployment/README.md` and linked deployment runbooks.

## Verification

- `make verify-prod-install-scripts` passed.
- `scripts/prod/preflight.sh --backend-env scripts/prod/config/backend.env.example --frontend-env scripts/prod/config/frontend.env.example --dry-run` returned `Preflight: OK`.

## Outcome

- Plan `17-06` is closed without implementing the obsolete `deploy/` path.
- Canonical production deployment path is Phase 500 (`scripts/prod/*` + `docs/deployment/*`).

