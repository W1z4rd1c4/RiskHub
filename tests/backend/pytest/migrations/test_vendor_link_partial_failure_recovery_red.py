"""RED Phase 4: a midway upgrade failure must roll back fully."""

from unittest.mock import patch

import pytest
from sqlalchemy import text

from tests.backend.pytest.migrations.conftest import run_vendor_migration_upgrade

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_failure_midway_rolls_back_to_pre_upgrade(postgres_engine_pre_migration) -> None:
    call_count = {"n": 0}

    def patched_create_fk(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("synthetic mid-upgrade failure")
        from alembic import op as real_op

        return real_op.create_foreign_key(*args, **kwargs)

    with patch("alembic.op.create_foreign_key", side_effect=patched_create_fk):
        async with postgres_engine_pre_migration.begin() as conn:
            with pytest.raises(RuntimeError, match="synthetic"):
                await conn.run_sync(run_vendor_migration_upgrade)

    async with postgres_engine_pre_migration.connect() as conn:
        col = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='vendors' AND column_name='status'"
            )
        )
        assert col.first() is not None, "Partial failure left vendors.status dropped"

        delcode = await conn.execute(
            text(
                "SELECT confdeltype FROM pg_constraint "
                "WHERE conname='fk_vendor_risk_links_vendor_id_vendors'"
            )
        )
        row = delcode.first()
        assert row is not None, "FK was dropped without rebuild - partial state"
        assert row[0] != "c", "CASCADE applied despite mid-upgrade failure"
