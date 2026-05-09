"""Runtime contract: ``approval_scenarios.approver_roles`` must land as JSONB.

The static contract test at
``tests/backend/pytest/architecture/test_w5_approval_scenario_roles_json_contract_red.py``
proves the source declares ``JSON().with_variant(JSONB(), "postgresql")`` and that
the migration is forward-only. That test cannot prove the migration was *executed*
or that runtime serialization round-trips natively.

This file covers the runtime gap: against a real Postgres test database we assert
the column type is ``jsonb`` and that values round-trip as native Python ``list``
objects (not JSON-encoded strings). The tests are gated on the ``postgres`` marker
so they no-op under the default SQLite harness, where JSONB is impossible by
construction.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalScenario

pytestmark = [pytest.mark.asyncio, pytest.mark.postgres]


def _require_postgres(db_session: AsyncSession) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL schema introspection")


async def test_approver_roles_column_is_jsonb_in_postgres(db_session: AsyncSession) -> None:
    """The migrated column type is JSONB, not JSON or text."""

    _require_postgres(db_session)

    result = await db_session.execute(
        text(
            """
            SELECT data_type, udt_name
            FROM information_schema.columns
            WHERE table_name = 'approval_scenarios'
              AND column_name = 'approver_roles'
            """
        )
    )
    row = result.first()

    assert row is not None, "approval_scenarios.approver_roles column must exist"
    assert row.udt_name == "jsonb", (
        f"approver_roles must be JSONB in Postgres; got udt_name={row.udt_name!r}"
    )


async def test_approver_roles_round_trips_as_native_list_in_postgres(
    db_session: AsyncSession,
) -> None:
    """A persisted approver_roles value comes back as a Python list, not a JSON string."""

    _require_postgres(db_session)

    scenario = ApprovalScenario(
        key="w5_jsonb_runtime_check",
        display_name="W5 JSONB runtime check",
        description="Asserts JSONB native round-trip semantics for approver_roles.",
        approver_roles=["risk_manager", "cro"],
    )
    db_session.add(scenario)
    await db_session.commit()
    await db_session.refresh(scenario)

    assert isinstance(scenario.approver_roles, list), (
        "approver_roles must round-trip as a Python list under JSONB, "
        f"got {type(scenario.approver_roles).__name__}"
    )
    assert scenario.approver_roles == ["risk_manager", "cro"]
