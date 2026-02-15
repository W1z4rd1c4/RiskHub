"""RiskTypeConfig model for dynamic risk type management."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RiskTypeConfig(Base):
    """
    Dynamic risk type configuration managed by CRO via Risk Hub.

    Replaces the hardcoded RiskType enum with database-driven configuration.
    System types (strategic, operational) cannot be deleted.
    """
    __tablename__ = "risk_types"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Unique code identifier (e.g., "strategic", "operational", "compliance")
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)

    # Display name shown in UI
    display_name: Mapped[str] = mapped_column(String(100))

    # Optional description
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Hex color code for UI display (e.g., "#3b82f6")
    color: Mapped[str] = mapped_column(String(7), default="#64748b")

    # Optional Lucide icon name (e.g., "shield", "alert-triangle")
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Display order in dropdowns
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Soft delete flag
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # System types cannot be deleted
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)

    # Denormalized count for quick access (updated on risk create/delete)
    risk_count: Mapped[int] = mapped_column(Integer, default=0)

    # Audit fields
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationship to risks (optional, for eager loading)
    # risks: Mapped[list["Risk"]] = relationship("Risk", back_populates="risk_type_config")

    def __repr__(self) -> str:
        return f"<RiskTypeConfig(code='{self.code}', display_name='{self.display_name}')>"
