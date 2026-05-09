from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, declared_attr, mapped_column


class AbstractVendorLink:
    """Shared column shape for vendor link junction tables."""

    __abstract__ = True

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    @declared_attr
    def vendor_id(cls) -> Mapped[int]:
        return mapped_column(
            ForeignKey("vendors.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
