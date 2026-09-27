"""Committed security epoch matched to protected evidence outside database backups."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class IdentityRestoreCutover(Base):
    __tablename__ = "identity_restore_cutover"
    __table_args__ = (CheckConstraint("id = 1", name="ck_identity_restore_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    installation_id: Mapped[str] = mapped_column(ForeignKey("installation_identity.installation_id"), nullable=False)
    epoch: Mapped[str] = mapped_column(String(36), nullable=False)
    signing_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    manifest_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    checkpoint_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cutover_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
