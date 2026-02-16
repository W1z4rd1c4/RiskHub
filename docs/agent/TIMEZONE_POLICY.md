# Timezone Policy

Canonical timezone contract for backend writes and tests.

## UTC-Aware Contract

- Persist all "instant" timestamps as timezone-aware UTC (`datetime` with `tzinfo=UTC`) and Postgres `timestamptz`.
- Use `backend/app/core/datetime_utils.py`:
  - `utc_now()` for new timestamps.
  - `coerce_utc()` when accepting values that might be naive (naive is treated as UTC).

## Regression Guards

- `backend/tests/test_no_datetime_utcnow.py` fails if `datetime.utcnow()` or `replace(tzinfo=None)` is reintroduced in `backend/app` or `backend/scripts`.
- `backend/tests/test_timezone_policy.py` fails if any `DateTime(timezone=False)` column exists.

## Legacy Conversion Migration

- `backend/alembic/versions/e9c3a1b7d2f4_convert_naive_timestamps_to_timestamptz.py` converts legacy `timestamp without time zone` columns using `AT TIME ZONE 'UTC'`.
- Conversion assumes existing naive values represent UTC instants.

Verification date:
- 2026-02-16
