"""Issue remediation management domain models."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.control import Control
    from app.models.control_execution import ControlExecution
    from app.models.department import Department
    from app.models.key_risk_indicator import KeyRiskIndicator
    from app.models.risk import Risk
    from app.models.user import User
    from app.models.vendor import Vendor


class IssueSeverity(str, PyEnum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class IssueStatus(str, PyEnum):
    open = "open"
    triaged = "triaged"
    in_progress = "in_progress"
    ready_for_validation = "ready_for_validation"
    closed = "closed"


class IssueSourceType(str, PyEnum):
    manual = "manual"
    control_execution = "control_execution"
    kri_breach = "kri_breach"
    audit = "audit"


class IssueRemediationStatus(str, PyEnum):
    draft = "draft"
    active = "active"
    blocked = "blocked"
    completed = "completed"


class IssueExceptionStatus(str, PyEnum):
    requested = "requested"
    approved = "approved"
    revoked = "revoked"
    expired = "expired"


class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[IssueSeverity] = mapped_column(
        SAEnum(IssueSeverity, name="issue_severity", native_enum=False, validate_strings=True),
        nullable=False,
        default=IssueSeverity.medium,
    )
    status: Mapped[IssueStatus] = mapped_column(
        SAEnum(IssueStatus, name="issue_status", native_enum=False, validate_strings=True),
        nullable=False,
        default=IssueStatus.open,
    )
    source_type: Mapped[IssueSourceType] = mapped_column(
        SAEnum(IssueSourceType, name="issue_source_type", native_enum=False, validate_strings=True),
        nullable=False,
        default=IssueSourceType.manual,
    )
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), nullable=False, index=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    validation_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Deadline reminder dedupe fields used by scheduled notification jobs.
    last_due_soon_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_overdue_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    department: Mapped["Department"] = relationship("Department", lazy="selectin")
    owner: Mapped["User | None"] = relationship("User", foreign_keys=[owner_user_id], lazy="selectin")
    created_by: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_id], lazy="selectin")
    links: Mapped[list["IssueLink"]] = relationship(
        "IssueLink",
        back_populates="issue",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    remediation_plan: Mapped["IssueRemediationPlan | None"] = relationship(
        "IssueRemediationPlan",
        back_populates="issue",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    exceptions: Mapped[list["IssueException"]] = relationship(
        "IssueException",
        back_populates="issue",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_issues_status_severity", "status", "severity"),
        Index("ix_issues_department_status", "department_id", "status"),
        Index("ix_issues_owner_status", "owner_user_id", "status"),
        Index("ix_issues_due_status", "due_at", "status"),
    )


class IssueLink(Base):
    __tablename__ = "issue_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, index=True)
    risk_id: Mapped[int | None] = mapped_column(ForeignKey("risks.id"), nullable=True)
    control_id: Mapped[int | None] = mapped_column(ForeignKey("controls.id"), nullable=True)
    execution_id: Mapped[int | None] = mapped_column(ForeignKey("control_executions.id"), nullable=True)
    kri_id: Mapped[int | None] = mapped_column(ForeignKey("key_risk_indicators.id"), nullable=True)
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    issue: Mapped["Issue"] = relationship("Issue", back_populates="links", lazy="selectin")
    risk: Mapped["Risk | None"] = relationship("Risk", lazy="selectin")
    control: Mapped["Control | None"] = relationship("Control", lazy="selectin")
    execution: Mapped["ControlExecution | None"] = relationship("ControlExecution", lazy="selectin")
    kri: Mapped["KeyRiskIndicator | None"] = relationship("KeyRiskIndicator", lazy="selectin")
    vendor: Mapped["Vendor | None"] = relationship("Vendor", lazy="selectin")

    __table_args__ = (
        CheckConstraint(
            "("
            "(CASE WHEN risk_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN control_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN execution_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN kri_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN vendor_id IS NOT NULL THEN 1 ELSE 0 END)"
            ") = 1",
            name="ck_issue_links_exactly_one_target",
        ),
    )


class IssueRemediationPlan(Base):
    __tablename__ = "issue_remediation_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issue_id: Mapped[int] = mapped_column(
        ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, index=True, unique=True
    )
    status: Mapped[IssueRemediationStatus] = mapped_column(
        SAEnum(
            IssueRemediationStatus,
            name="issue_remediation_status",
            native_enum=False,
            validate_strings=True,
        ),
        nullable=False,
        default=IssueRemediationStatus.draft,
    )
    progress_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    target_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    blocker_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    completion_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    issue: Mapped["Issue"] = relationship("Issue", back_populates="remediation_plan", lazy="selectin")
    owner: Mapped["User | None"] = relationship("User", foreign_keys=[owner_user_id], lazy="selectin")

    __table_args__ = (
        CheckConstraint(
            "progress_percent >= 0 AND progress_percent <= 100", name="ck_issue_remediation_progress_range"
        ),
        Index("ix_issue_remediation_status", "status"),
        Index("ix_issue_remediation_owner", "owner_user_id"),
        UniqueConstraint("issue_id", name="uq_issue_remediation_issue_id"),
    )


class IssueException(Base):
    __tablename__ = "issue_exceptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[IssueExceptionStatus] = mapped_column(
        SAEnum(
            IssueExceptionStatus,
            name="issue_exception_status",
            native_enum=False,
            validate_strings=True,
        ),
        nullable=False,
        default=IssueExceptionStatus.requested,
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    requested_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    issue: Mapped["Issue"] = relationship("Issue", back_populates="exceptions", lazy="selectin")
    requested_by: Mapped["User | None"] = relationship("User", foreign_keys=[requested_by_id], lazy="selectin")
    approved_by: Mapped["User | None"] = relationship("User", foreign_keys=[approved_by_id], lazy="selectin")
