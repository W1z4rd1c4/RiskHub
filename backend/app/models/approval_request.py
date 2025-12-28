"""Approval request model for tracking deletion and edit approval workflows."""
from enum import Enum as PyEnum
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, Enum as SQLEnum, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ApprovalStatus(str, PyEnum):
    """Status of an approval request."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class ApprovalResourceType(str, PyEnum):
    """Type of resource being requested for deletion/edit."""
    RISK = "risk"
    CONTROL = "control"
    KRI = "kri"


class ApprovalActionType(str, PyEnum):
    """Type of action requiring approval."""
    DELETE = "delete"
    EDIT = "edit"


class ApprovalRequest(Base):
    """
    Tracks approval requests for deletions and edits.
    
    When a non-privileged user requests deletion or edits sensitive data,
    an ApprovalRequest is created. Risk Manager must approve before
    the action is executed.
    """
    __tablename__ = "approval_requests"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # What resource is being modified
    resource_type: Mapped[ApprovalResourceType] = mapped_column(
        SQLEnum(ApprovalResourceType, name="approval_resource_type", create_constraint=True),
        nullable=False
    )
    resource_id: Mapped[int] = mapped_column(Integer, nullable=False)
    resource_name: Mapped[str] = mapped_column(String(255), nullable=False)  # Snapshot for display
    
    # Action type: delete or edit
    action_type: Mapped[ApprovalActionType] = mapped_column(
        SQLEnum(ApprovalActionType, name="approval_action_type", create_constraint=True),
        default=ApprovalActionType.DELETE,
        nullable=False
    )
    
    # For edits: JSON storing pending changes {"field": {"old": v1, "new": v2}}
    pending_changes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    
    # Request details
    requested_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)  # Mandatory per user requirement
    
    # Status tracking
    status: Mapped[ApprovalStatus] = mapped_column(
        SQLEnum(ApprovalStatus, name="approval_status", create_constraint=True),
        default=ApprovalStatus.PENDING,
        nullable=False
    )
    
    # Resolution details
    resolved_by_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    
    # Relationships
    requested_by: Mapped["User"] = relationship("User", foreign_keys=[requested_by_id])
    resolved_by: Mapped["User"] = relationship("User", foreign_keys=[resolved_by_id])
    
    # Indexes for efficient queries
    __table_args__ = (
        Index("ix_approval_resource", "resource_type", "resource_id"),
        Index("ix_approval_status", "status"),
        Index("ix_approval_requested_by", "requested_by_id"),
        Index("ix_approval_action_type", "action_type"),
    )


# Import for type hints
from datetime import UTC
from app.models.user import User

