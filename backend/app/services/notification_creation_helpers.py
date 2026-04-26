from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType
from app.models.user import User


def notification_type_is_enabled(user: User | None, notification_type: NotificationType) -> bool:
    if user is None or not user.notification_preferences:
        return True
    return bool(user.notification_preferences.get(notification_type.value, True))


async def load_notification_recipient(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def find_existing_notification(
    db: AsyncSession,
    *,
    user_id: int,
    notification_type: NotificationType,
    resource_type: str | None,
    resource_id: int | None,
) -> Notification | None:
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.user_id == user_id,
                Notification.type == notification_type,
                Notification.resource_type == resource_type,
                Notification.resource_id == resource_id,
            )
        )
    )
    return result.scalar_one_or_none()
