from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.control import Control
    from app.models.risk import Risk
    from app.models.user import User
    from app.models.vendor import Vendor


class Department(Base):
    """Department model for control catalog ownership."""

    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, comment="System departments cannot be deleted")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    manager_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", use_alter=True),
        nullable=True,
        index=True,
    )

    # Relationships
    manager: Mapped["User"] = relationship("User", foreign_keys=[manager_id])
    users: Mapped[list["User"]] = relationship("User", back_populates="department", foreign_keys="User.department_id")
    controls: Mapped[list["Control"]] = relationship("Control", back_populates="department")
    risks: Mapped[list["Risk"]] = relationship("Risk", back_populates="department")
    vendors: Mapped[list["Vendor"]] = relationship("Vendor", back_populates="department")

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
