"""RED Phase 4: before applying the migration, run an FK-orphan precheck."""

import pytest
from sqlalchemy import text

from tests.backend.pytest.migrations.conftest import load_vendor_migration

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_precheck_reports_orphans_before_migration(postgres_engine_pre_migration) -> None:
    check_no_link_orphans = load_vendor_migration().check_no_link_orphans

    async with postgres_engine_pre_migration.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO vendor_risk_links (id, vendor_id, risk_id, created_at) "
                "VALUES (-1, 99999, (SELECT id FROM risks LIMIT 1), now())"
            )
        )

    with pytest.raises(ValueError, match="orphan"):
        async with postgres_engine_pre_migration.connect() as conn:
            await conn.run_sync(lambda sync: check_no_link_orphans(sync))
