"""Vendor assessment model for third-party due diligence workflow."""

from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VendorAssessmentStatus(str, PyEnum):
    draft = "draft"
    submitted = "submitted"
    in_review = "in_review"
    committee_recommended = "committee_recommended"
    approved = "approved"
    rejected = "rejected"


class VendorAssessmentScope(str, PyEnum):
    standard = "standard"
    dora = "dora"


class VendorCommitteeRecommendation(str, PyEnum):
    approve = "approve"
    approve_with_conditions = "approve_with_conditions"
    reject = "reject"


class VendorAssessment(Base):
    __tablename__ = "vendor_assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_id: Mapped[int] = mapped_column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)

    status: Mapped[VendorAssessmentStatus] = mapped_column(
        SAEnum(
            VendorAssessmentStatus,
            name="vendor_assessment_status",
            native_enum=False,
            validate_strings=True,
        ),
        nullable=False,
        index=True,
        default=VendorAssessmentStatus.draft,
    )

    template_key: Mapped[str] = mapped_column(String(100), nullable=False)
    template_version: Mapped[str] = mapped_column(String(20), nullable=False)
    scope: Mapped[VendorAssessmentScope] = mapped_column(
        SAEnum(
            VendorAssessmentScope,
            name="vendor_assessment_scope",
            native_enum=False,
            validate_strings=True,
        ),
        nullable=False,
    )

    answers_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    evidence_reference: Mapped[str | None] = mapped_column(Text, nullable=True)

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    submitted_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    decided_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    committee_recommendation: Mapped[VendorCommitteeRecommendation | None] = mapped_column(
        SAEnum(
            VendorCommitteeRecommendation,
            name="vendor_committee_recommendation",
            native_enum=False,
            validate_strings=True,
        ),
        nullable=True,
    )
    conditions_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="assessments", lazy="selectin")
    submitted_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[submitted_by_user_id], lazy="selectin")
    reviewed_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[reviewed_by_user_id], lazy="selectin")
    decided_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[decided_by_user_id], lazy="selectin")

    __table_args__ = (
        Index("ix_vendor_assessments_vendor_status", "vendor_id", "status"),
    )


from app.models.user import User
from app.models.vendor import Vendor
