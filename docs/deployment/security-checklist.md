# Production Security Checklist

> **Last Updated**: 2026-04-06
> **Audience**: DevOps / Security Engineering

## Config And Startup Guards

RiskHub production deploys must satisfy these invariants:

- `DEBUG=false`
- `MOCK_AUTH_ENABLED=false`
- `AUTH_MODE=microsoft_sso`
- `DIRECTORY_PROVIDER=graph`
- `SECRET_KEY` secret file length at least `32`
- `SECRET_KEY` must not use a blocked weak default (for example `dev-secret-key-not-for-production-use`, `changeme`, `dev-secret`, `test-secret`, `secret`)
- explicit external PostgreSQL `database_url` secret file
- explicit `CORS_ORIGINS`
- reachable `REDIS_URL`
- valid `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, and one supported Entra Graph credential mechanism
- `ENTRA_JIT_PROVISIONING_ENABLED=false`
- `AUTH_SSO_ALLOW_EMAIL_LINK=false`
- reviewed `TRUSTED_PROXIES` when traffic passes through non-default proxy networks
- if broad proxy ranges are intentionally trusted in production, set `ALLOW_BROAD_TRUSTED_PROXIES_IN_PRODUCTION=true` explicitly instead of relying on warnings

## Network

- Terminate TLS on the host or an upstream reverse proxy.
- Do not expose PostgreSQL or Redis publicly.
- Use the frontend same-origin entrypoint as the public surface.
- Linux target:
  - nginx is the public listener
  - backend API stays on `127.0.0.1:8000`
  - scheduler stays on `127.0.0.1:8001`
  - default `TRUSTED_PROXIES` is loopback only unless operators explicitly add upstream proxy CIDRs
- Docker target:
  - frontend container is the public listener
  - backend is not intended to be directly exposed
  - deploy tooling pins a dedicated docker subnet and renders it into `TRUSTED_PROXIES`
  - if an existing `riskhub-network` uses a different subnet, preflight fails until the network is recreated or the configured subnet is updated

## Authentication

- Production is SSO-only.
- Require Microsoft Entra Enterprise App assignment before go-live.
- Validate the Microsoft Entra app registration and redirect URIs before go-live.
- Register both the sign-in callback (`/auth/sso/callback`) and the post-logout redirect (`/login`) for the production origin.
- Production bootstrap users must be pre-linked to Entra `oid` before first login; do not rely on first-login email linking.
- Every SSO login must start with a backend-issued challenge; `/api/v1/auth/sso/exchange` is not valid without a matching challenge cookie, `state`, and `nonce`.
- The backend resolves the post-login redirect target server-side after challenge validation.
- Normal logout invalidates all RiskHub app sessions for the user.
- Entra-side disablement is not instant logout today; RiskHub revokes on the next `AD_DEPROVISION_CHECK_INTERVAL_MINUTES` cycle plus the remaining access-token lifetime.
- Cookie-authenticated auth endpoints require same-origin browser requests via explicit Origin/Referer validation plus double-submit CSRF.
- Keep bootstrap admin/CRO emails distinct.

## Scheduler

- Run the scheduler exactly once.
- Docker target: use the dedicated scheduler container.
- Linux target: use the dedicated `riskhub-scheduler.service`.
- Confirm scheduler ownership is actually held:
  - Admin Console `/admin` shows scheduler lock held and a current owner instance.
  - deploy smoke shows exactly one running `__scheduler_runtime__` row.

## Runtime Hardening

- Backend and frontend runtime processes must run as non-root.
- Keep `/docs` and `/openapi.json` disabled in production.
- Use `/api/v1/readyz` for machine-facing readiness checks.
- Use `/api/v1/health` for public diagnostic health detail and `/api/v1/admin/health` for deeper authenticated runtime diagnostics.
- Keep Redis enabled because rate limiting and account lockout depend on it.
- Keep `RATE_LIMIT_FAIL_CLOSED_ON_BACKEND_ERROR=true` in production so Redis outages return explicit `503` responses instead of silently degrading to per-worker in-memory limits. Only disable it as an emergency rollback while Redis remediation is in progress.
- Keep the segmented rate-limit boundary in mind when changing production controls:
  - route policy now lives in `backend/app/middleware/rate_limit/policy.py`
  - Redis vs in-memory behavior now lives in `backend/app/middleware/rate_limit/backend.py`
- Keep `ALLOWED_HOSTS` explicit and reviewed for the real public hostname set; do not assume CORS or runtime defaults are sufficient.
- Keep the modern header baseline only: CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`, and `Permissions-Policy`. Do not reintroduce legacy `X-XSS-Protection`.
- Keep production CSP free of `style-src 'unsafe-inline'`.
- `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` are intentionally not enabled in the current baseline because the app does not need cross-origin isolated browser capabilities today; reassess before introducing SharedArrayBuffer or similar browser features.
- Avoid broad private-network `TRUSTED_PROXIES` ranges unless you intentionally trust all peers inside those networks to supply `X-Forwarded-For`.
- Treat any dead-letter outbox event as an operational incident until triaged.
- After deploy, verify outbox backlog is healthy:
  - dead-letter count is `0`
  - dispatcher status is succeeding
  - backlog is not growing unexpectedly

## Secrets Handling

- Treat `/etc/riskhub/secrets/` and `/etc/riskhub/runtime/redis_url` as sensitive.
- Keep `/etc/riskhub/riskhub.env` non-secret only.
- Never commit production secrets.
- Keep `/etc/riskhub` on an encrypted disk or encrypted mount.
- `./scripts/deploy.sh secrets-edit ...` keeps its temporary edit workspace on the same host-managed deployment path as `--secret-dir`, not under `/tmp`.
- Store `SECRET_KEY`, database credentials, Redis password, and the active Entra confidential credential material in a secret manager when possible.
- `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` are not secret values.
- Prefer file-backed certificate credential mode over shared client secret when your Entra app registration supports it; treat client-secret production mode as an explicit waiver.
- If client-secret rotation must invalidate the in-process Graph token cache without a process restart, set `ENTRA_CREDENTIAL_FINGERPRINT` explicitly.
- Use the rolling restart procedure in `docs/deployment/runbooks/entra-credential-rotation.md` when rotating Entra credentials; fingerprint bump alone does not clear old in-memory Graph token cache entries.
- Keep certificate PEM material only in `/etc/riskhub/secrets/entra_client_certificate_private_key`; do not inline it into non-secret env files.
- Do not print secrets into shell history or CI logs.

## Session Cutover

- After deploying the mandatory SSO challenge flow in production, revoke legacy refresh sessions with:
  - `python -m scripts.revoke_refresh_sessions --reason sso_absolute_expiry_cutover`
- This cutover must not mass-bump `token_version`; existing access tokens should age out naturally.

## Supply Chain

- Python baseline is `3.13`.
- Docker target should pull only published release images.
- Linux target should use only published `riskhub-linux-<version>.tar.gz` bundles.
- Validate release artifacts in CI before publishing.
- CI policy now requires immutable action SHAs, digest-pinned service images, and production contract doc parity checks before PR merge.

## Backups And Rollback

- Take regular PostgreSQL backups and test restore.
- Prefer PITR for production databases.
- Application rollback does not downgrade the database.
- Treat migration rollback as a controlled database operation or a forward-fix.
