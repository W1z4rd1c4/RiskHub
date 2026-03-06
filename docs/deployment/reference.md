# Deployment Reference

> **Last Updated**: 2026-03-06
> **Audience**: Operators and maintainers

## Operator Config

Non-secret path:

```bash
/etc/riskhub/riskhub.env
```

Required keys:

- `PUBLIC_URL`
- `ENTRA_TENANT_ID`
- `ENTRA_CLIENT_ID`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_CRO_EMAIL`

Optional keys:

- `API_WORKERS` default `4`
- `FRONTEND_BIND_PORT` default `80`

Secret directory:

```bash
/etc/riskhub/secrets/
```

Required files:

- `database_url`
- `secret_key`
- `entra_client_secret`
- `redis_password`

## Derived Internally

These are rendered by the deploy tooling and are not operator-edited:

- `CORS_ORIGINS`
- `ALLOWED_HOSTS`
- `SERVER_NAME`
- `REDIS_URL`
- `DATABASE_URL_FILE`
- `SECRET_KEY_FILE`
- `ENTRA_CLIENT_SECRET_FILE`
- `REDIS_URL_FILE`
- scheduler singleton settings
- target-specific nginx/systemd/docker runtime files

Target-specific Redis URLs:

- docker: `redis://:<password>@redis:6379/0`
- linux: `redis://:<password>@127.0.0.1:6379/0`

## Command Reference

```bash
scripts/deploy.sh init --target docker|linux [--config PATH] [--secret-dir PATH] [--force]
scripts/deploy.sh secrets-init --target docker|linux [--secret-dir PATH] [--force]
scripts/deploy.sh secrets-edit --target docker|linux [--secret-dir PATH]
scripts/deploy.sh secrets-check --target docker|linux [--secret-dir PATH]
scripts/deploy.sh preflight --target docker|linux --config PATH
scripts/deploy.sh deploy --target docker --config PATH --secret-dir PATH --version VERSION
scripts/deploy.sh deploy --target docker --config PATH --secret-dir PATH --backend-image IMAGE --frontend-image IMAGE --redis-image IMAGE
scripts/deploy.sh deploy --target linux --config PATH --secret-dir PATH --bundle PATH
scripts/deploy.sh upgrade --target docker|linux ...
scripts/deploy.sh status --target docker|linux
scripts/deploy.sh logs --target docker|linux [--service all|backend|scheduler|frontend|redis] [--tail N] [--follow]
scripts/deploy.sh smoke --target docker|linux --config PATH --secret-dir PATH
scripts/deploy.sh rollback --target docker --config PATH --secret-dir PATH [--service all|backend|frontend]
scripts/deploy.sh rollback --target linux --config PATH --secret-dir PATH
```

Common flags:

- `--secret-dir PATH`
- `--dry-run`
- `--yes`
- `--verbose`

## Runtime Defaults

Backend API:

- bind host `127.0.0.1`
- bind port `8000`

Scheduler:

- enabled as a separate runtime only
- worker count forced to `1`
- linux bind port `8001`

Linux target:

- release root `/opt/riskhub/releases`
- current symlink `/opt/riskhub/current`
- previous symlink `/opt/riskhub/previous`
- backend unit `riskhub-backend.service`
- scheduler unit `riskhub-scheduler.service`
- redis unit `riskhub-redis.service`
- nginx site `/etc/nginx/conf.d/riskhub.conf`

## Production Invariants

- `DEBUG=false`
- `MOCK_AUTH_ENABLED=false`
- `AUTH_MODE=microsoft_sso`
- `SECRET_KEY_FILE` resolves to a value with length at least `32`
- explicit `CORS_ORIGINS`
- explicit `DATABASE_URL_FILE`
- reachable `REDIS_URL_FILE`
- `/docs` and `/openapi.json` disabled in production
