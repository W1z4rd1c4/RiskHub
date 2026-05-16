"""RED Phase 4: before applying the migration, run an FK-orphan precheck.

The orphan fixture uses session_replication_role when the test role is a
superuser. Non-superuser lanes temporarily drop the vendor FK in the same
transaction as the orphan insert and precheck so PostgreSQL FK enforcement does
not own the expected failure.
"""

import pytest
from sqlalchemy import text

from tests.backend.pytest.migrations.conftest import load_vendor_migration

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


async def _vendor_id_fk_name(conn) -> str | None:
    return await conn.scalar(
        text(
            """
            SELECT c.conname
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
            WHERE c.contype = 'f'
              AND c.conrelid = to_regclass('vendor_risk_links')
              AND c.confrelid = to_regclass('vendors')
              AND a.attname = 'vendor_id'
            LIMIT 1
            """
        )
    )


async def _insert_orphan_vendor_link(conn) -> None:
    insert_sql = text(
        "INSERT INTO vendor_risk_links (id, vendor_id, risk_id, created_at) "
        "VALUES (-1, 99999, (SELECT id FROM risks LIMIT 1), now())"
    )
    is_superuser = await conn.scalar(text("SELECT current_setting('is_superuser') = 'on'"))
    if is_superuser:
        await conn.execute(text("SET session_replication_role = replica"))
        try:
            await conn.execute(insert_sql)
        finally:
            await conn.execute(text("SET session_replication_role = origin"))
        return

    fk_name = await _vendor_id_fk_name(conn)
    if fk_name is None:
        await conn.execute(insert_sql)
        return

    quoted_fk = '"' + fk_name.replace('"', '""') + '"'
    await conn.execute(text(f"ALTER TABLE vendor_risk_links DROP CONSTRAINT {quoted_fk}"))
    await conn.execute(insert_sql)


@pytest.mark.asyncio
async def test_precheck_reports_orphans_before_migration(postgres_engine_pre_migration) -> None:
    check_no_link_orphans = load_vendor_migration().check_no_link_orphans

    async with postgres_engine_pre_migration.connect() as conn:
        transaction = await conn.begin()
        try:
            await _insert_orphan_vendor_link(conn)
            with pytest.raises(ValueError, match="orphan"):
                await conn.run_sync(lambda sync: check_no_link_orphans(sync))
        finally:
            await transaction.rollback()

    async with postgres_engine_pre_migration.connect() as conn:
        assert await conn.scalar(text("SELECT COUNT(*) FROM vendor_risk_links WHERE id = -1")) == 0
