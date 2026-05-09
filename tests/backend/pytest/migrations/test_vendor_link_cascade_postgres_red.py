"""RED: postgres-lane FK CASCADE + column drop assertions on the new migration."""

import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_vendor_link_fks_cascade_after_upgrade(postgres_session) -> None:
    rows = await postgres_session.execute(
        text(
            """
            SELECT conname, confdeltype FROM pg_constraint
            WHERE conname IN (
                'fk_vendor_risk_links_vendor_id_vendors',
                'fk_vendor_risk_links_risk_id_risks',
                'fk_vendor_control_links_vendor_id_vendors',
                'fk_vendor_control_links_control_id_controls',
                'fk_vendor_kri_links_vendor_id_vendors',
                'fk_vendor_kri_links_kri_id_key_risk_indicators'
            )
            """
        )
    )
    by_name = {r.conname: r.confdeltype for r in rows}
    assert len(by_name) == 6, f"missing constraints: {by_name}"
    for name, deltype in by_name.items():
        if isinstance(deltype, bytes):
            deltype = deltype.decode()
        assert deltype == "c", f"{name} confdeltype={deltype!r}, expected 'c' (CASCADE)"


@pytest.mark.asyncio
async def test_vendors_status_column_absent_after_upgrade(postgres_session) -> None:
    row = await postgres_session.execute(
        text(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'vendors' AND column_name = 'status'
            """
        )
    )
    assert row.first() is None, "vendors.status column must be dropped"


@pytest.mark.asyncio
async def test_ix_vendors_status_index_absent(postgres_session) -> None:
    row = await postgres_session.execute(
        text(
            """
            SELECT indexname FROM pg_indexes
            WHERE tablename = 'vendors' AND indexname = 'ix_vendors_status'
            """
        )
    )
    assert row.first() is None, "ix_vendors_status must be dropped with the column"
