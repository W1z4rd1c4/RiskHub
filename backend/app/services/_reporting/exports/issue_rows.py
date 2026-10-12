"""Bounded Issue row projection shared by current and evaluation-date exports."""

from datetime import datetime
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Issue, User
from app.services._issue_register.linked_context import build_issue_linked_visibility

from .rows import _issue_to_row


async def build_issue_export_rows(
    *,
    db: AsyncSession,
    current_user: User,
    models: list[Issue],
    as_of_dt: datetime,
    overdue_mode: Literal["current_register", "evaluation_report"],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for offset in range(0, len(models), 100):
        batch = models[offset : offset + 100]
        linked_visibility = await build_issue_linked_visibility(db, current_user, batch)
        rows.extend(
            _issue_to_row(
                issue,
                as_of_dt=as_of_dt,
                current_user=current_user,
                linked_visibility=linked_visibility,
                overdue_mode=overdue_mode,
            )
            for issue in batch
        )
    return rows
