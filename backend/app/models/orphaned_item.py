"""OrphanedItem model for tracking orphaned risks/controls when users are deactivated."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class OrphanedItem(Base):
    """
    Tracks items (risks, controls) that have lost their owner due to user deactivation.
    
    When a user is deactivated and they owned risks or controls, those items
    are flagged here for administrative review and reassignment.
    """
    __tablename__ = "orphaned_items"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    
    # What type of item lost its owner
    item_type: Mapped[str] = mapped_column(String(20), index=True)  # "risk" | "control"
    item_id: Mapped[int] = mapped_column(Integer, index=True)  # FK to risks.id or controls.id
    
    # Who was the previous owner
    previous_owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    previous_owner: Mapped["User"] = relationship(
        "User", 
        foreign_keys=[previous_owner_id],
        backref="orphaned_items_as_previous_owner"
    )
    
    # When did it become orphaned
    orphaned_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    
    # Resolution fields
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_by: Mapped["User"] = relationship(
        "User",
        foreign_keys=[resolved_by_id],
        backref="resolved_orphans"
    )
    new_owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    new_owner: Mapped["User"] = relationship(
        "User",
        foreign_keys=[new_owner_id],
        backref="inherited_orphans"
    )
    
    # Status
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # "pending" | "resolved"


# Import for type hints
from app.models.user import User
