"""Enrollment records completion while holding the existing User authority lock."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import LocalAuthDelivery, LocalBootstrapTarget, User


async def complete_bootstrap_target(db: AsyncSession, user: User) -> None:
    if user.local_enrollment_state != "enrolled":
        return
    target = await db.scalar(
        select(LocalBootstrapTarget).where(LocalBootstrapTarget.user_id == user.id).with_for_update()
    )
    if target is not None and target.completed_at is None:
        target.completed_at = utc_now()
        delivery = await db.get(LocalAuthDelivery, target.delivery_id, with_for_update=True)
        if delivery is not None:
            delivery.ciphertext = None
            delivery.status = "completed"
