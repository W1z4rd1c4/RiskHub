# Plan 500-06 Summary: Enforceable Security Hardening Defaults

## Completed: 2026-02-16

### Scope Delivered

- Enforced production-safe defaults in the Phase 500 scripts:
  - backend not published on the host by default (frontend-only `/api` access),
  - Redis always password-protected and persisted (`--requirepass`, `--appendonly yes`),
  - container hardening that does not break the images:
    - `--restart unless-stopped`
    - `--security-opt no-new-privileges`
    - avoid host networking.
- Added script redaction guardrails:
  - dry-run output does not echo `DATABASE_URL`, `SECRET_KEY`, `REDIS_PASSWORD`, or `WEBHOOK_SECRET`,
  - `run_redacted` used where secrets would otherwise appear in command lines.

### Files Changed

| File | Change |
|------|--------|
| `scripts/prod/install_redis.sh` | NEW |
| `scripts/prod/install_backend.sh` | NEW |
| `scripts/prod/install_frontend.sh` | NEW |
| `scripts/prod/lib/common.sh` | NEW |

### Verification

- `make verify-prod-install-scripts` → passed (includes dockerized ShellCheck)

### Outcome

The Phase 500 production install path is secure-by-default without relying on operator memory, while keeping the deployment model simple (single host, internal Docker network, external PostgreSQL).

