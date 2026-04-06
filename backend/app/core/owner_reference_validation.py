from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User

_OWNER_LABELS = {
    "Risk owner",
    "Control owner",
    "Reporting owner",
}


async def validate_active_owner_reference(
    db: AsyncSession,
    *,
    user_id: int | None,
    label: str,
) -> None:
    """Validate that an ownership-style user reference points to an active user."""
    if label not in _OWNER_LABELS:
        raise ValueError(f"Unsupported owner label: {label}")

    if user_id is None:
        return

    row = (await db.execute(select(User.id, User.is_active).where(User.id == user_id))).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} not found")

    _, is_active = row
    if not is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} is inactive")
