# Plan 500-04 Summary: Shared Script Framework + Preflight Validation

## Completed: 2026-02-16

### Scope Delivered

- Added a shared `scripts/prod/lib/common.sh` library:
  - strict bash mode defaults,
  - deterministic names for network/containers/volumes,
  - idempotent Docker helpers,
  - common flag parsing (`--backend-env`, `--frontend-env`, `--dry-run`, `--yes`, `--verbose`),
  - safe dry-run output and redaction helper for secrets.
- Added a shared `scripts/prod/lib/preflight.sh` library:
  - validates production guard invariants (DEBUG/mock-auth/auth mode/secret length/CORS),
  - rejects compose-style `DATABASE_URL` (`@db:`),
  - validates `FRONTEND_HOST_PORT` and checks host port collisions,
  - optional external DB connectivity check (`SELECT 1`) via an ephemeral backend container.
- Added `scripts/prod/preflight.sh` wrapper command and documented dockerized ShellCheck.

### Files Changed

| File | Change |
|------|--------|
| `scripts/prod/lib/common.sh` | NEW |
| `scripts/prod/lib/preflight.sh` | NEW |
| `scripts/prod/preflight.sh` | NEW |
| `scripts/prod/README.md` | NEW |

### Verification

- `scripts/prod/preflight.sh --backend-env scripts/prod/config/backend.env.example --frontend-env scripts/prod/config/frontend.env.example --dry-run` → `Preflight: OK`
- `docker run --rm -v "$PWD":/work -w /work koalaman/shellcheck:stable -x scripts/prod/*.sh` → no findings

### Outcome

All production install scripts now share a consistent CLI contract and fail fast on misconfiguration before mutating containers.

