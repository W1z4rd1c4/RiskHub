from __future__ import annotations

from collections.abc import Iterable
from typing import Final

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.models import Vendor

_VENDOR_OWNER_LOCK_NAMESPACE = 0x5256
_OWNER_NOT_CHECKED: Final = object()


async def acquire_vendor_owner_identity_locks(
    db: AsyncSession,
    *,
    user_ids: Iterable[int | None],
) -> None:
    """Serialize Vendor ownership assignment and identity deactivation."""
    if db.get_bind().dialect.name != "postgresql":
        return

    for user_id in sorted(user_id for user_id in set(user_ids) if user_id is not None):
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:namespace, :user_id)"),
            {"namespace": _VENDOR_OWNER_LOCK_NAMESPACE, "user_id": user_id},
        )


async def acquire_vendor_owner_identity_lock(
    db: AsyncSession,
    *,
    user_id: int,
) -> None:
    await acquire_vendor_owner_identity_locks(db, user_ids=(user_id,))


async def lock_vendor_for_owner_mutation(
    db: AsyncSession,
    *,
    vendor_id: int,
    user_ids: Iterable[int | None],
    expected_owner_user_id: int | None | object = _OWNER_NOT_CHECKED,
) -> Vendor | None:
    """Acquire the canonical identity -> Vendor-row accountability lock order."""
    await acquire_vendor_owner_identity_locks(db, user_ids=user_ids)
    vendor = (
        await db.execute(
            select(Vendor)
            .where(Vendor.id == vendor_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if (
        vendor is not None
        and expected_owner_user_id is not _OWNER_NOT_CHECKED
        and vendor.outsourcing_owner_user_id != expected_owner_user_id
    ):
        raise ConflictError("Vendor ownership changed concurrently; retry")
    return vendor


async def lock_vendors_for_owner_deactivation(
    db: AsyncSession,
    *,
    user_id: int,
) -> list[Vendor]:
    """Lock every Vendor held by a deactivating Outsourcing Owner."""
    await acquire_vendor_owner_identity_lock(db, user_id=user_id)
    return list(
        (
            await db.execute(
                select(Vendor)
                .where(Vendor.outsourcing_owner_user_id == user_id)
                .order_by(Vendor.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
