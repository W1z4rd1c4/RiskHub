"""RED Phase 4: running upgrade() twice on Postgres must not corrupt state."""

import pytest
from sqlalchemy import text

from app.core.exceptions import MigrationAlreadyAppliedError
from tests.backend.pytest.migrations.conftest import run_vendor_migration_upgrade

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_upgrade_then_re_upgrade_is_safe(postgres_engine) -> None:
    async with postgres_engine.connect() as conn:
        baseline = await conn.execute(text("SELECT COUNT(*) FROM vendors"))
        baseline_count = baseline.scalar()
        await conn.rollback()

        with pytest.raises(MigrationAlreadyAppliedError):
            async with conn.begin():
                await conn.run_sync(run_vendor_migration_upgrade)

        post = await conn.execute(text("SELECT COUNT(*) FROM vendors"))
        assert post.scalar() == baseline_count, "row count drift after re-upgrade"

        col = await conn.execute(
            text(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name='vendors' AND column_name='status'
                """
            )
        )
        assert col.first() is None
