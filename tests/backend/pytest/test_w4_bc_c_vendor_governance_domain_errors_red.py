from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Vendor
from app.services._vendor_governance.links import require_vendor_access
from app.services._vendor_governance.policy import assert_vendor_readable
from app.services._vendor_links.kri_bridge import ensure_vendors_exist, validate_assignable_vendors


@pytest.mark.asyncio
async def test_missing_readable_vendor_raises_not_found_domain_error(db_session: AsyncSession, test_user):
    from app.core.exceptions import NotFoundError

    with pytest.raises(NotFoundError) as exc_info:
        await assert_vendor_readable(db_session, vendor_id=999_999, current_user=test_user)

    assert exc_info.value.detail == "Vendor not found"


@pytest.mark.asyncio
async def test_link_write_without_vendor_permission_raises_authorization_before_inactive_conflict(
    db_session: AsyncSession,
    test_user_approval_requester,
    test_department,
    test_user,
):
    from app.core.exceptions import AuthorizationError

    vendor = Vendor(
        name="Inactive Vendor Permission Order",
        process="Outsourced operations",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        is_archived=True,
    )
    db_session.add(vendor)
    await db_session.commit()

    with pytest.raises(AuthorizationError) as exc_info:
        await require_vendor_access(
            db_session,
            vendor.id,
            test_user_approval_requester,
            entity_permission="risks",
            require_write=True,
        )

    assert exc_info.value.detail == "Permission denied: vendors:write"


@pytest.mark.asyncio
async def test_kri_assignable_missing_vendor_raises_not_found_domain_error(db_session: AsyncSession, test_user):
    from app.core.exceptions import NotFoundError

    with pytest.raises(NotFoundError) as exc_info:
        await validate_assignable_vendors(db_session, current_user=test_user, vendor_ids=[999_999])

    assert exc_info.value.detail == "Vendor not found"


@pytest.mark.asyncio
async def test_kri_vendor_existence_validation_keeps_bad_request_domain_error(db_session: AsyncSession):
    from app.core.exceptions import ValidationError

    with pytest.raises(ValidationError) as exc_info:
        await ensure_vendors_exist(db_session, vendor_ids=[999_999])

    assert exc_info.value.detail == "Vendor not found"
