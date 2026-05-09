"""ApprovalScenario model for configurable approval workflow rules."""
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class ApprovalScenario(Base):
    """
    Configurable approval scenarios managed by CRO via Risk Hub.

    Each scenario represents a business action that may require approval.
    CRO can toggle scenarios on/off and configure which roles can approve.

    Note: Scenarios are fixed (seeded) - CRO cannot create new ones.
    """

    __tablename__ = "approval_scenarios"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Unique key identifier (e.g., "risk_delete", "kri_value_submit")
    key: Mapped[str] = mapped_column(String(50), unique=True, index=True)

    # Human-readable name for UI
    display_name: Mapped[str] = mapped_column(String(100))

    # Description of what this scenario covers
    description: Mapped[str] = mapped_column(String(500))

    # Whether this scenario requires approval (toggle)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=True)

    # JSON array of role names that can approve: ["risk_manager", "cro"]
    approver_roles: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"),
        default=lambda: ["risk_manager", "cro"],
    )

    # Audit fields
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    # Relationship to user who last updated
    updated_by: Mapped["User"] = relationship("User", foreign_keys=[updated_by_id])

    def __repr__(self) -> str:
        return f"<ApprovalScenario(key='{self.key}', requires_approval={self.requires_approval})>"
