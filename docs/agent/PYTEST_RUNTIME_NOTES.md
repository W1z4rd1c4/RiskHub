# Pytest Runtime Notes

Canonical runtime notes for RiskHub backend tests.

## Postgres Test Mode

- Default tests run on in-memory SQLite.
- Set `TEST_DATABASE_URL` to run the suite on Postgres.
- `tests/backend/pytest/conftest.py` applies `alembic upgrade head` once per session and truncates all tables between tests when using Postgres.
- When a live Docker stack is already using `riskhub`, point `TEST_DATABASE_URL` at a separate sibling database such as `riskhub_test`.
- Do not aim Postgres-mode pytest at the live app database; the test fixture truncates all tables between tests.
- Example:
  - `cd backend && TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test pytest -v`

## Pytest Exit Hang (SQLite / aiosqlite)

- Symptom: `pytest` completes but does not exit; a non-daemon `aiosqlite` `_connection_worker_thread` remains alive.
- Canonical fix in `tests/backend/pytest/conftest.py`:
  - ensure session `event_loop` is set as current loop
  - dispose `app.state.db_engine` at session end via an autouse fixture
- Debugging:
  - set `PYTEST_THREAD_DEBUG=1` to dump remaining non-daemon threads at `pytest_sessionfinish`.

Verification date:
- 2026-03-29
