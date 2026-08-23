# RiskHub Backend

FastAPI + SQLAlchemy backend for RiskHub, including the API surface, database models, migrations, and runtime packaging.

## What Lives Here

- application code under `app/`
- Alembic migrations under `alembic/`
- backend test and tooling configuration via `pytest.ini`, `ruff.toml`, and requirements files
- Docker build targets for runtime and DB-task images

## Common Commands

```bash
cd backend
./venv/bin/alembic upgrade head
./venv/bin/pytest -q
TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test make -f ../scripts/Makefile test-postgres-ci
./venv/bin/python -m ruff check app ../tests/backend/pytest scripts
```

## Development Dependency Contract

The repository-root `.tool-versions` file is the canonical development
baseline: Python 3.13 and Node 24. Backend local setup and CI install development
and test dependencies through one stable entrypoint:

```bash
cd backend
python -m pip install -r requirements-dev.txt
```

The dependency files have distinct responsibilities:

- `requirements-dev.in` records human-edited dependency intent and accepted
  ranges. Audit-only tooling is intentionally absent.
- `requirements-dev-constraints.txt` records the exact Python 3.13 resolver
  output for development/test plus the isolated `pip-audit==2.10.0` audit tool.
  Packages needed only by the audit are inert during an ordinary development
  install because they are constraints, not requested requirements.
- `requirements-dev.txt` composes the input and lock. Its `lock-sha256` comment
  changes whenever the generated lock changes, invalidating the existing local
  dependency-state hash and GitHub Actions pip cache key.
- `requirements-prod-readiness-audit-constraints.txt` is an exact pins-only
  mirror consumed by the established production-readiness audit contract. It
  deliberately contains no nested `-r` or `-c` directives.

Regenerate all generated files with one Python 3.13 command from the repository
root:

```bash
python3 scripts/tools/refresh_python_dependency_lock.py
```

The command creates an isolated virtual environment, fixes pip at 26.0, resolves
`requirements-dev.in` together with `pip-audit==2.10.0`, writes both exact lock
surfaces, and updates the entrypoint digest. It contacts the configured package
index and should run only in a dedicated dependency-refresh change.

Validate the committed topology and digest without contacting a package index:

```bash
python3 scripts/tools/validate_python_dependency_lock.py
```

`.github/workflows/python-dev-lock-refresh.yml` runs the same refresh monthly and
opens a pull request only when resolution changes. Dependabot continues to
propose changes to the human-edited backend dependency inputs. Lock-refresh PRs
must carry the normal backend, lint, type, security, and production-readiness
evidence before merge.

## Testing Notes

- default local pytest runs use SQLite unless `TEST_DATABASE_URL` is set
- Postgres-mode pytest applies Alembic migrations and truncates tables between tests
- scheduler ownership, migration-defined constraints, and other PG-specific behavior should be verified in the named Postgres CI contract (`make -f ../scripts/Makefile test-postgres-ci`)

## Related Docs

- repo overview: `../README.md`
- testing matrix: `../docs/TESTING.md`
- deployment docs: `../docs/deployment/README.md`
