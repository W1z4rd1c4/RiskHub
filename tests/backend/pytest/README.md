# Backend Test Infrastructure

## Test Database

Tests run against **SQLite in-memory** for speed and isolation by default:

```python
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"  # default
```

You can override the test database by exporting `TEST_DATABASE_URL` before running pytest.

### Implications

1. **No Alembic Migrations**: Tests use `Base.metadata.create_all()` which creates
   tables from SQLAlchemy models but does NOT run Alembic migrations.

2. **Missing Constraints**: Migration-defined constraints (partial unique indexes,
   custom check constraints) are NOT present in the test database.

3. **PostgreSQL Features Unavailable**:
   - `pg_indexes` system table
   - Partial unique indexes (`WHERE status = 'PENDING'`)
   - PostgreSQL-specific functions

## Running Tests

```bash
# All tests (SQLite)
cd backend && pytest

# Skip PostgreSQL-only tests
cd backend && pytest -m "not postgres"

# Verbose with output
cd backend && pytest -v -s

# Check available markers
cd backend && pytest --markers
```

## PostgreSQL-Only Tests

Tests requiring PostgreSQL are marked with:

```python
@pytest.mark.postgres
async def test_pg_specific_feature(db_session):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL")
    ...
```

To run these tests, set up a PostgreSQL test database and export `TEST_DATABASE_URL`:

```bash
cd backend
export TEST_DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/riskhub_test"
pytest -m postgres -v
```

## Common Fixtures

| Fixture | Description |
|---------|-------------|
| `db_session` | Async SQLAlchemy session |
| `test_user` | Admin user with wildcard permissions |
| `test_user_employee` | Employee user with limited permissions |
| `test_user_cro` | CRO user with privileged permissions |
| `test_department` | Sample department |
| `auth_client` | Authenticated HTTP client |

## Adding Tests

1. Use `@pytest.mark.asyncio` for async tests (auto-mode enabled)
2. Use fixtures for common entities
3. Mark PostgreSQL-specific tests with `@pytest.mark.postgres`
4. Document any test database limitations in test docstrings
