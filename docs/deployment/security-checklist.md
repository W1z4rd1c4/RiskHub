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

- RiskHub does not terminate TLS itself. A reverse proxy or load balancer that terminates TLS MUST sit in front of RiskHub in any environment reachable by untrusted clients; the app's own listeners are plaintext by design.
- Terminate TLS on that upstream reverse proxy or load balancer, then proxy plaintext to the RiskHub public listener (see [Reference TLS-terminating reverse proxy](#reference-tls-terminating-reverse-proxy)).
- The upstream proxy must forward `X-Forwarded-Proto` and `X-Forwarded-For`; add its address to `TRUSTED_PROXIES` so forwarded client IPs are trusted (see Runtime Hardening).
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
- Admin Console session revocation must go through `/api/v1/admin/sessions/{user_id}/revoke`; it rejects self-revocation, bumps `token_version`, revokes active refresh rows, and records the admin activity in one transaction.
- The Entra verifier cache must be scoped by tenant, client, discovery URL, clock skew, allowed email domains, and business-role token claim; discovery/JWKS calls remain protected by the outbound egress guard.
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

## Reference TLS-terminating Reverse Proxy

RiskHub ships plaintext listeners only. Operators bring their own TLS-terminating
reverse proxy or load balancer. The public RiskHub listener is the frontend
(`FRONTEND_BIND_PORT`, default `80`); it already proxies `/api/` to the backend
on `127.0.0.1:8000`, so terminate TLS upstream and proxy plaintext to that
frontend port.

Minimal nginx example (adjust `server_name`, cert paths, and the `proxy_pass`
port to match `FRONTEND_BIND_PORT`):

```nginx
server {
    listen 443 ssl;
    server_name riskhub.example.com;

    ssl_certificate     /etc/ssl/riskhub/fullchain.pem;
    ssl_certificate_key /etc/ssl/riskhub/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}

server {
    listen 80;
    server_name riskhub.example.com;
    return 308 https://$host$request_uri;
}
```

- The RiskHub frontend consumes `X-Forwarded-For`/`X-Forwarded-Proto` from its
  immediate peer only when that peer is listed in `TRUSTED_PROXIES`. When this
  external proxy is a separate host from the RiskHub frontend, add its address to
  `TRUSTED_PROXIES` (see Runtime Hardening) so client IPs are attributed
  correctly for rate limiting, refresh-session IP attribution, and request logs.
- Keep the RiskHub frontend and backend listeners bound to loopback or an
  internal network so the only public ingress is this TLS-terminating proxy.

Certificate acquisition is out of scope for RiskHub tooling. Operators without
existing TLS infrastructure typically use one of:

- Let's Encrypt via an ACME client of their choice (for example certbot, acme.sh,
  or a proxy with built-in ACME).
- A managed cloud load balancer that terminates TLS (for example Azure
  Application Gateway, AWS ALB, or GCP HTTPS Load Balancer).
- Cloudflare or a comparable TLS-terminating CDN in front of the proxy.
