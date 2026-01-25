"""Notification model for in-app notifications."""
from enum import Enum as PyEnum
from datetime import datetime, UTC
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, Enum as SQLEnum, Index, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class NotificationType(str, PyEnum):
    """Type of notification."""
    APPROVAL_PENDING = "approval_pending"
    APPROVAL_RESOLVED = "approval_resolved"
    APPROVAL_CANCELLED = "approval_cancelled"
    KRI_DUE_SOON = "kri_due_soon"
    KRI_DUE_TOMORROW = "kri_due_tomorrow"
    KRI_OVERDUE = "kri_overdue"
    KRI_NEAR_BREACH = "kri_near_breach"
    KRI_BREACH_DETECTED = "kri_breach_detected"
    QUESTIONNAIRE_SENT = "questionnaire_sent"
    QUESTIONNAIRE_DUE_SOON = "questionnaire_due_soon"
    QUESTIONNAIRE_OVERDUE = "questionnaire_overdue"
    QUESTIONNAIRE_SUBMITTED = "questionnaire_submitted"
    QUESTIONNAIRE_CLARIFICATION_REQUESTED = "questionnaire_clarification_requested"
    VENDOR_ASSESSMENT_SUBMITTED = "vendor_assessment_submitted"
    VENDOR_ASSESSMENT_COMMITTEE_RECOMMENDED = "vendor_assessment_committee_recommended"
    VENDOR_ASSESSMENT_DECIDED = "vendor_assessment_decided"
    VENDOR_REASSESSMENT_DUE_SOON = "vendor_reassessment_due_soon"
    VENDOR_REASSESSMENT_OVERDUE = "vendor_reassessment_overdue"
    VENDOR_SLA_DUE_SOON = "vendor_sla_due_soon"
    VENDOR_SLA_DUE_TOMORROW = "vendor_sla_due_tomorrow"
    VENDOR_SLA_OVERDUE = "vendor_sla_overdue"
    VENDOR_SLA_NEAR_BREACH = "vendor_sla_near_breach"
    VENDOR_SLA_BREACH_DETECTED = "vendor_sla_breach_detected"


class Notification(Base):
    """
    In-app notification for users.
    
    Notifications are generated for:
    - Approval workflow events (new request, approved, rejected)
    - KRI deadline reminders (due soon, tomorrow, overdue)
    - KRI breach warnings (approaching limit)
    """
    __tablename__ = "notifications"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Recipient
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Notification content
    type: Mapped[NotificationType] = mapped_column(
        SQLEnum(NotificationType, name="notification_type", create_constraint=True),
        nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Optional link to resource
    resource_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # 'risk', 'control', 'kri', 'approval'
    resource_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    # Status
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(UTC), 
        nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="notifications")
    
    # Indexes for efficient queries
    __table_args__ = (
        Index("ix_notifications_user_read", "user_id", "is_read"),  # Composite for unread count
        Index("ix_notifications_user_created", "user_id", "created_at"),  # For chronological listing
    )


# Import for type hints
from app.models.user import User
