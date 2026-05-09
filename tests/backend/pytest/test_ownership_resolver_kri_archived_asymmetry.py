"""KRI archived asymmetry: KRI-direct does not filter; risk-scope does."""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    get_kri_ids_where_reporting_owner,
    get_risk_ids_where_kri_reporting_owner,
    is_kri_reporting_owner,
    is_risk_kri_reporting_owner,
)
from app.models import Department, KeyRiskIndicator, User
from tests.backend.pytest.factories import create_test_kri, create_test_risk

pytestmark = pytest.mark.contract


@pytest_asyncio.fixture
async def archived_kri_with_reporting_owner(
    db_session: AsyncSession,
    test_department: Department,
    test_user_employee: User,
) -> KeyRiskIndicator:
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_id_code="R-OWN-KRI-ARCH",
        name="Archived KRI Risk",
    )
    return await create_test_kri(
        db_session,
        risk_id=risk.id,
        metric_name="Archived ownership KRI",
        overrides={
            "reporting_owner_id": test_user_employee.id,
            "is_archived": True,
        },
    )


@pytest.mark.asyncio
async def test_is_kri_reporting_owner_returns_true_for_archived_kri(
    db_session: AsyncSession,
    archived_kri_with_reporting_owner: KeyRiskIndicator,
) -> None:
    """`is_kri_reporting_owner` does not filter `is_archived`."""
    user_id = archived_kri_with_reporting_owner.reporting_owner_id
    kri_id = archived_kri_with_reporting_owner.id

    assert await is_kri_reporting_owner(db_session, user_id, kri_id) is True


@pytest.mark.asyncio
async def test_get_kri_ids_where_reporting_owner_includes_archived(
    db_session: AsyncSession,
    archived_kri_with_reporting_owner: KeyRiskIndicator,
) -> None:
    """`get_kri_ids_where_reporting_owner` does not filter `is_archived`."""
    user_id = archived_kri_with_reporting_owner.reporting_owner_id

    ids = await get_kri_ids_where_reporting_owner(db_session, user_id)

    assert archived_kri_with_reporting_owner.id in ids


@pytest.mark.asyncio
async def test_is_risk_kri_reporting_owner_excludes_archived(
    db_session: AsyncSession,
    archived_kri_with_reporting_owner: KeyRiskIndicator,
) -> None:
    """`is_risk_kri_reporting_owner` filters `is_archived`."""
    user_id = archived_kri_with_reporting_owner.reporting_owner_id
    risk_id = archived_kri_with_reporting_owner.risk_id

    assert await is_risk_kri_reporting_owner(db_session, user_id, risk_id) is False


@pytest.mark.asyncio
async def test_get_risk_ids_where_kri_reporting_owner_excludes_archived(
    db_session: AsyncSession,
    archived_kri_with_reporting_owner: KeyRiskIndicator,
) -> None:
    """`get_risk_ids_where_kri_reporting_owner` filters `is_archived`."""
    user_id = archived_kri_with_reporting_owner.reporting_owner_id

    risk_ids = await get_risk_ids_where_kri_reporting_owner(db_session, user_id)

    assert archived_kri_with_reporting_owner.risk_id not in risk_ids
