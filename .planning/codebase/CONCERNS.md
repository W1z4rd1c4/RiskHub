# Codebase Concerns

**Analysis Date:** 2026-02-02

## Tech Debt

**Mixed timestamp semantics (naive vs timezone-aware):**
- Issue: DB columns across models/migrations mix `TIMESTAMP WITHOUT TIME ZONE` and `TIMESTAMP WITH TIME ZONE`, while code frequently uses `datetime.now(UTC)`.
- Why: historical migrations/models evolved inconsistently; some code compensates with `.replace(tzinfo=None)`.
- Impact: runtime 500s possible when asyncpg receives tz-aware datetime for a naive column (example: approvals reject/approve flow).
- Fix approach:
  - Preferred long-term: standardize to timezone-aware columns + `DateTime(timezone=True)` models.
  - Short-term/compat: ensure writes to naive columns strip tzinfo consistently (see recent changes in approvals/KRI archive).

**Permission/role drift between seed paths:**
- Issue: there are multiple seeding sources (`backend/app/db/seed.py`, `backend/scripts/seed_demo.py`, `backend/scripts/seed_roles_permissions.py`) that can diverge from `docs/BUSINESS_LOGIC.md`.
- Impact: UI/behavior mismatches depending on which seeding path is used (demo vs app seed vs tests).
- Fix approach: converge to a single source of truth and/or add tests asserting permissions for demo users.

## Known Bugs

**Approval resolve endpoints can 500 on timestamp mismatch (Postgres):**
- Symptoms: UI shows “Request failed with status 500” when approving/rejecting.
- Root cause: tz-aware datetime being written to naive timestamp columns (DBAPIError from asyncpg).
- Mitigation: standardize writes or migrate columns to `timestamptz`.

## Security Considerations

**MOCK_AUTH_ENABLED bypass:**
- Risk: `X-Mock-User-Id` header allows impersonation.
- Current mitigation: guarded to debug mode; production guard in `backend/app/main.py`.
- Recommendation: ensure prod deploy never sets `DEBUG=true` and does not expose the demo login endpoint.

## Performance Bottlenecks

**Potential N+1 query risks:**
- Some endpoints rely on relationship loading strategies; keep an eye on list endpoints and dashboard aggregation paths.
- Recommendation: use SQLAlchemy eager loading (`selectinload/joinedload`) consistently on high-traffic endpoints.

## Fragile Areas

**Approval execution side effects:**
- `backend/app/services/approval_execution_service.py` performs multi-entity writes and logs; changes can have broad effects.
- Safe modification: add/extend tests in `backend/tests/test_approval_*` for any workflow changes.

## Test Coverage Gaps

**Timezone behavior against real Postgres:**
- Many tests run on SQLite; timezone/enum differences may slip through.
- Recommendation: keep (or add) at least one CI job running the critical approval flows against Postgres (marker `postgres`).

---

*Concerns audit: 2026-02-02*
*Update as issues are fixed or new ones discovered*

