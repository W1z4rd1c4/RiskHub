from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from sqlalchemy import Boolean, DateTime, ForeignKey, and_, or_
from sqlalchemy.orm import Mapped, declared_attr, mapped_column

from app.core.datetime_utils import utc_now


class ArchivableMixin:
    """Additive soft-delete columns shared by archivable register entities."""

    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @declared_attr
    def archived_by_id(cls) -> Mapped[int | None]:
        return mapped_column(ForeignKey("users.id"), nullable=True)

    @classmethod
    def live(cls):
        return archived_clause(cls, archived=False)

    @classmethod
    def archived(cls):
        return archived_clause(cls, archived=True)

    def mark_archived(
        self,
        actor: Any,
        *,
        when: datetime | None = None,
        on_audit: Callable[[Any], None] | None = None,
    ) -> None:
        self.is_archived = True
        self.archived_at = when or utc_now()
        self.archived_by_id = getattr(actor, "id", actor)
        if on_audit is not None:
            on_audit(self)

    def mark_restored(
        self,
        actor: Any,
        *,
        on_audit: Callable[[Any], None] | None = None,
    ) -> None:
        self.is_archived = False
        self.archived_at = None
        self.archived_by_id = None
        if on_audit is not None:
            on_audit(self)


def archived_clause(model: Any, *, archived: bool = True):
    """Return the canonical archive predicate for a model with `is_archived`."""

    status_column = getattr(model, "status", None)
    legacy_values = {
        "risks": ("archived",),
        "controls": ("archived",),
        "vendors": ("inactive",),
    }.get(getattr(model, "__tablename__", ""))

    flag_clause = model.is_archived.is_(archived)
    if status_column is None or not legacy_values:
        return flag_clause
    if archived:
        return or_(flag_clause, status_column.in_(legacy_values))
    return and_(flag_clause, status_column.notin_(legacy_values))
