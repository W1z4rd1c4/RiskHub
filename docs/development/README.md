# RiskHub Development Startup

> **Version**: 1.4
> **Last Updated**: 2026-09-30
> **Audience**: Engineering, QA

Back to tree: [`docs/DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

This document defines the supported local startup surface for RiskHub development.

For the stable day-to-day contributor commands, CI gate ownership, and advanced
target boundary, see
[`docs/development/CONTRIBUTOR_COMMANDS.md`](./CONTRIBUTOR_COMMANDS.md).

## Canonical Paths

### Docker onboarding path

Recommended for most people.

Use Docker when you want the lowest-friction first run, demo stack, or deterministic reset workflow.

```bash
./scripts/install.sh demo
./scripts/install.sh demo --reset test
```

Behavior:

- `up` boots DB + Redis, runs `alembic upgrade head`, seeds base demo data, then starts backend/frontend containers
- Full Docker stack serves the app at `http://localhost/`
- Demo frontend and API access are bound to loopback by default; passwordless demo identities must not be exposed to untrusted networks
- `reset --dataset test` wipes Docker volumes, reruns migrations + base seed, then adds deterministic E2E fixtures

Open `http://localhost/login` after startup.

Deterministic live-verification preference:

- Prefer `./scripts/install.sh demo --reset test` when you need seeded browser verification against the Docker-served app at `http://localhost/`.
- Advanced/manual Docker entrypoints remain available under `./scripts/compose.sh`.
- The Docker bootstrap service now uses the backend `dbtasks` target, so `reset --dataset test` runs migrations and seed commands with the required Postgres client dependencies.
- Docker Compose now inherits the backend image's Python healthcheck instead of overriding it with `curl`.

LAN mode is an explicit opt-in to passwordless access, including administrative
identities. Use synthetic data on a trusted, isolated network only. Pass an IPv4
address assigned to the Docker host for the advertised/CORS origin. This option
publishes the frontend on **all IPv4 host interfaces** (`0.0.0.0:80`):

```bash
./scripts/compose.sh up --lan 192.168.1.20
```

The script prints a warning and serves the demo login at
`http://192.168.1.20/login`; PostgreSQL, Redis, and the direct backend port stay on
loopback. `http://localhost/login` remains reachable so the supported
verify/status/doctor commands keep working. CORS is not a network access control.
Running `up` again without `--lan`
restores loopback-only publication, even if a shell or `.env` contains an old bind
override. Reset also uses the loopback default.

For advanced direct Compose use, `RISKHUB_DEMO_BIND_HOST` controls only the
frontend host bind and defaults to `127.0.0.1`; setting it to a non-loopback address
is the same explicit security opt-in. Set `LAN_HOST` to the matching origin host
when overriding it. Use `0.0.0.0` to preserve localhost-based lifecycle probes;
binding only a specific LAN interface requires adapting those probes manually.
Inspect without starting containers using
`docker compose --profile full config`. This demo topology is never a production
deployment option; use `./scripts/install.sh production` for production.

### Local contributor path

Use local runtimes when you are actively iterating on backend or frontend code.

```bash
./scripts/install.sh dev
./scripts/install.sh dev --backend
```

Behavior:

- Starts Docker-backed DB + Redis via `./scripts/compose.sh up --profile db-only`
- Runs backend dependency setup and schema-head preflight locally
- On a brand-new local database, auto-runs migrations and base seed before re-checking schema head
- Starts backend on `http://localhost:8000`
- Starts Vite frontend on `http://localhost:5173` in full mode
- Defaults to demo-friendly auth (`AUTH_MODE=hybrid_dev`, `MOCK_AUTH_ENABLED=true`, `DEBUG=true`)

Important:

- On an already-initialized local database, schema drift still fails fast with an actionable migration command.
- Advanced/manual contributor entrypoints remain available under `./scripts/dev.sh`.
- Manual recovery path:

```bash
cd backend
./venv/bin/alembic upgrade head
./venv/bin/python -m app.db.seed
```

## Lifecycle / Recovery

Use the public lifecycle wrapper before dropping to the lower-level script layer. `./scripts/install.sh` remains the supported surface even though it is now backed by the internal Python control plane (`scripts/install_cli.py` + `scripts/install_lib/`).

```bash
./scripts/install.sh status --mode demo
./scripts/install.sh status --mode dev
./scripts/install.sh logs --mode demo --tail 200 --follow
./scripts/install.sh logs --mode dev --tail 200 --follow
./scripts/install.sh doctor --mode demo
./scripts/install.sh doctor --mode dev --repair
```

Behavior:

- `status --mode demo` reports Docker container state plus `http://localhost/login` and `/api/v1/auth/config` readiness.
- `status --mode dev` reports DB/Redis availability, backend/frontend listener readiness, auth-config health, and local Node major compatibility.
- `logs --mode demo` routes to `./scripts/compose.sh logs`; `logs --mode dev` tails `.dev-backend.log` and `.dev-frontend.log`.
- `doctor --mode demo --repair` only starts the Docker stack if it is missing; it does not reset volumes or reseed data.
- `doctor --mode dev --repair` only restores db-only infra, dependency state, and daemonized backend/frontend processes; it does not reset local data.

## Demo / Dev Auth

- Local `./scripts/dev.sh` uses the Vite frontend at `http://localhost:5173/login`
- Docker `./scripts/compose.sh up` uses the nginx frontend at `http://localhost/login`
- Both paths keep demo login enabled for development-only auth flows
- The deterministic picker presents ten demo personas as equal cards in a
  five-column by two-row desktop grid. The dedicated CISO card demonstrates
  Threat stewardship and least privilege; it is not a platform administrator
  or approval resolver. Use the same persona identities after
  `./scripts/install.sh demo --reset test` so manuals, Playwright, and
  screenshots describe one repeatable dataset.
- To disable demo auth for local backend runs:

```bash
AUTH_MODE=password MOCK_AUTH_ENABLED=false ./scripts/dev.sh
```

## Identity foundation development

Production installation identity is established explicitly and startup validation is
read-only; see [identity foundations](../security/identity-foundations.md). Keep the
usual hybrid demo defaults for browser verification. The native profile pairs
`AUTH_MODE=password` with `DIRECTORY_PROVIDER=none` and defines
`LOCAL_MFA_POLICY=required|optional` (required by default). It is staged backend work;
complete native UI/installer delivery and production admission remain later gates.
Do not treat disabling the demo picker as a supported native production install.

## E2E and Testing Notes

- Playwright E2E still defaults to the local Vite frontend at `http://localhost:5173`
- `npm run e2e` may start Vite automatically through `frontend/playwright.config.ts`
- Docker full-stack at `http://localhost/` is the preferred deterministic live-verification surface, but Playwright must be pointed at it with `FRONTEND_URL=http://localhost`
- Recommended deterministic E2E reset:

```bash
./scripts/install.sh demo --reset test
```

- Docker-targeted browser commands:

```bash
cd frontend
FRONTEND_URL=http://localhost npm run e2e:business-logic
FRONTEND_URL=http://localhost POLISH_AUDIT_DEEP=1 npx playwright test -c playwright.config.ts ../tests/frontend/e2e/polish-audit.spec.ts --project=chromium
```

- Docker-targeted Playwright runs rely on `FRONTEND_URL=http://localhost`; the shared E2E login helper is now origin-aware and works against both `http://localhost:5173` and the Docker nginx surface.
- The underlying advanced/manual reset command remains `./scripts/compose.sh reset --dataset test`.
- `polish-audit.spec.ts` covers `riskhub`, `light`, and `dark`.
- When the Docker app stack is live on the `riskhub` database, run Postgres marker tests against a separate `riskhub_test` database instead of the live app DB.

## Boundaries

- `./scripts/riskhub.sh` is the stable day-to-day contributor façade; it delegates to the supported implementation entrypoints.
- `./scripts/install.sh` is the public first-run and lifecycle entrypoint for demo and local contributor installs
- internal implementation note: `./scripts/install.sh` is a stable shell wrapper over `./scripts/install_cli.py`; do not bypass it in runbooks
- `./scripts/compose.sh` and `./scripts/dev.sh` remain supported advanced/manual entrypoints
- Production deployment remains separate and should use `./scripts/install.sh production --target docker|linux`

## Repository Presentation Maintenance

Maintainers should keep the public GitHub repository settings aligned with the root README:

- Repository name: `RiskHub`
- Description: `Open-source risk operations for governed risks, controls, KRIs, vendors, approvals, and evidence.`
- Topics: `risk-management`, `grc`, `compliance`, `fastapi`, `react`, `postgresql`, `open-source`
- Homepage: leave empty until a hosted demo or public docs site exists
- Discussions: enabled for Q&A and self-hosting help
- Wiki: disabled while documentation remains in `docs/`
- Social preview: upload `docs/assets/readme/social-preview.png` in GitHub repository settings after README screenshot recapture

## Native component verification

The native backend uses a bound disposable database, real shared Redis, protected
local-auth keys and configured TLS SMTP. See
[native credentials](../security/identity-local-credentials.md) for inputs, policy
transitions, invitation/password journeys and the release boundary. Test both
`LOCAL_MFA_POLICY=required` and `optional`; a confirmed factor must remain enforced.
The focused fixture supplies test-only keys/binding. Never use demo seeds as a
production local-account bootstrap.

## Dependency maintenance

The supported toolchain remains Node 24 and Python 3.13. Monthly Dependabot
version updates allow minor/patch releases; the backend Docker lane allows only
patch releases so a Python minor-version migration does not change the runtime
implicitly. These `allow.update-types` filters do not restrict security updates
([GitHub option reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#update-types-allow)).
SemVer classification is a first filter, not compatibility evidence: review
pre-1.0 minor updates, peer dependencies and framework behavior individually.

Deferred migrations from the September dependency backlog are tracked separately:

- [Runtime baselines: Node 26 / Python 3.14](https://github.com/W1z4rd1c4/RiskHub/issues/222).
- [Frontend framework, styling and tooling migrations](https://github.com/W1z4rd1c4/RiskHub/issues/223).
- [Backend framework, crypto, test and tooling migrations](https://github.com/W1z4rd1c4/RiskHub/issues/224).
- [GitHub Actions major upgrades](https://github.com/W1z4rd1c4/RiskHub/issues/225).

For frontend maintenance, update the intended ranges in `frontend/package.json`,
regenerate `package-lock.json` using Node 24, and verify with a clean `npm ci`.
Resolve peer conflicts explicitly; do not use `--force` or relax checks merely to
accept a grouped update.

For Python maintenance, edit the human-maintained runtime/DB requirements and
`backend/requirements-dev.in`, then run from the repository root with Python 3.13:

```bash
python3 scripts/tools/refresh_python_dependency_lock.py
python3 scripts/tools/validate_python_dependency_lock.py
```

Commit both generated constraint files and the development entrypoint together.
Do not hand-edit generated locks, and do not merge a lock-only bot update over
changed input requirements. Keep intentional major-version bounds in the inputs;
protobuf 6 and filelock 3 are retained pending #224. The existing known-safe
FastAPI pin and dependency-audit exceptions remain governed by the security
contracts.

Action updates must retain verified immutable upstream SHAs and their version
comments. When the reviewed SARIF upload action changes, update its exact identity
in `scripts/security/validate_frontend_container_gate.py` and the matching
mutation-test anchors. When `.github/workflows/release.yml` changes, refresh its
reviewed Git blob identity in `docs/development/ci-gate-contract.json` and run the
contributor contract check. Preserve workflow permissions, conditions and
negative security cases.

Before merging a maintenance batch, require clean dependency installs, security
audits, frontend unit/lint/type/build checks, full backend regression, applicable
PostgreSQL/Redis and packaging contracts, and all four hosted Playwright shards
plus their aggregate on the final PR head. Close superseded grouped PRs only when
the maintenance replacement has merged and each deferred migration has a linked
issue. Review and remove temporary bounds as those migrations land.
