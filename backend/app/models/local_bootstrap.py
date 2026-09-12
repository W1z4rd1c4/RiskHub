"""Permanent initial-principal record; completion is never an account reset switch."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LocalBootstrapTarget(Base):
    __tablename__ = "local_bootstrap_targets"
    __table_args__ = (CheckConstraint("slot IN ('admin', 'cro')", name="ck_local_bootstrap_slot"),)
    installation_id: Mapped[str] = mapped_column(ForeignKey("installation_identity.installation_id"), primary_key=True)
    slot: Mapped[str] = mapped_column(String(8), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    initial_email: Mapped[str] = mapped_column(String(255), nullable=False)
    delivery_id: Mapped[str] = mapped_column(ForeignKey("local_auth_deliveries.id"), nullable=False)
    handoff_path: Mapped[str] = mapped_column(Text, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
