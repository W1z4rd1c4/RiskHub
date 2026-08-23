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

Install backend development and test dependencies through the canonical entrypoint:

```bash
cd backend
python -m pip install -r requirements-dev.txt
```

The dependency files have distinct responsibilities:

- `requirements-dev.in` records human-edited dependency intent.
- `requirements-dev-constraints.txt` records the exact Python 3.13 resolver output.
- `requirements-dev.txt` composes the input and lock, so existing local and CI
  install commands use the same resolved versions.
- `requirements-prod-readiness-audit-constraints.txt` reuses the same lock and
  adds the exact `pip-audit` requirement for the isolated audit environment.

Validate the contract without contacting a package index:

```bash
python scripts/tools/validate_python_dependency_lock.py
```

Regeneration instructions are recorded at the top of
`requirements-dev-constraints.txt`. Lock refreshes should be isolated pull
requests with the backend test, lint, type, and security evidence attached.

## Testing Notes

- default local pytest runs use SQLite unless `TEST_DATABASE_URL` is set
- Postgres-mode pytest applies Alembic migrations and truncates tables between tests
- scheduler ownership, migration-defined constraints, and other PG-specific behavior should be verified in the named Postgres CI contract (`make -f ../scripts/Makefile test-postgres-ci`)

## Related Docs

- repo overview: `../README.md`
- testing matrix: `../docs/TESTING.md`
- deployment docs: `../docs/deployment/README.md`
