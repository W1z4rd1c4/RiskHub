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

## Testing Notes

- default local pytest runs use SQLite unless `TEST_DATABASE_URL` is set
- Postgres-mode pytest applies Alembic migrations and truncates tables between tests
- scheduler ownership, migration-defined constraints, and other PG-specific behavior should be verified in the named Postgres CI contract (`make -f ../scripts/Makefile test-postgres-ci`)

## Related Docs

- repo overview: `../README.md`
- testing matrix: `../docs/TESTING.md`
- deployment docs: `../docs/deployment/README.md`
