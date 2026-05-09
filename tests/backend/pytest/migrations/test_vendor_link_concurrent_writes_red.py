"""RED Phase 4: concurrent INSERT during CASCADE delete must not leave orphans."""

import asyncio

import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_cascade_serializes_with_concurrent_inserts(postgres_engine, seeded_vendor) -> None:
    vendor_id = seeded_vendor.id

    async def insert_link():
        async with postgres_engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO vendor_risk_links (vendor_id, risk_id, created_at) "
                    "VALUES (:v, (SELECT id FROM risks LIMIT 1), now())"
                ),
                {"v": vendor_id},
            )

    async def cascade_delete():
        async with postgres_engine.begin() as conn:
            await conn.execute(text("DELETE FROM vendors WHERE id = :v"), {"v": vendor_id})

    await asyncio.gather(
        *(insert_link() for _ in range(5)),
        cascade_delete(),
        return_exceptions=True,
    )

    async with postgres_engine.connect() as conn:
        orphans = await conn.execute(
            text(
                "SELECT COUNT(*) FROM vendor_risk_links l "
                "LEFT JOIN vendors v ON v.id = l.vendor_id WHERE v.id IS NULL"
            )
        )
        assert orphans.scalar() == 0, "orphan vendor_risk_links rows after concurrent writes"
