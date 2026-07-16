"""Track owner-loss governance across supported business and ICT register entities."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class OrphanedItem(Base):
    """
    Track Risks, Controls, Processes, Assets, Threats, KRIs, and Vendors that
    require governance review after an owner is deactivated or an orphan sweep.

    Asset and Vendor records identify the affected responsibility explicitly;
    other item types retain the legacy nullable responsibility role.
    """

    __tablename__ = "orphaned_items"
    __table_args__ = (
        CheckConstraint(
            "responsibility_role IS NULL OR responsibility_role IN "
            "('business_owner', 'ict_owner', 'outsourcing_owner')",
            name="ck_orphaned_items_responsibility_role",
        ),
        Index(
            "uq_orphaned_items_pending_item_role",
            "item_type",
            "item_id",
            "responsibility_role",
            unique=True,
            sqlite_where=text("status = 'pending' AND responsibility_role IS NOT NULL"),
            postgresql_where=text("status = 'pending' AND responsibility_role IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # Polymorphic target type: risk, control, process, asset, threat, kri, or vendor.
    item_type: Mapped[str] = mapped_column(String(20), index=True)
    # Target identifier in the table selected by item_type; intentionally no single FK.
    item_id: Mapped[int] = mapped_column(Integer, index=True)
    # Role-specific rows distinguish an Asset's business_owner/ict_owner and a
    # Vendor's outsourcing_owner. Other orphan types keep this nullable.
    responsibility_role: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)

    # Who was the previous owner
    previous_owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    previous_owner: Mapped["User"] = relationship(
        "User", foreign_keys=[previous_owner_id], backref="orphaned_items_as_previous_owner"
    )

    # When did it become orphaned
    orphaned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Resolution fields
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_by: Mapped["User"] = relationship("User", foreign_keys=[resolved_by_id], backref="resolved_orphans")
    new_owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    new_owner: Mapped["User"] = relationship("User", foreign_keys=[new_owner_id], backref="inherited_orphans")

    # Status
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # "pending" | "resolved"
