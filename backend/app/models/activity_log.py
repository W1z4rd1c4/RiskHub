"""Activity log model for tracking all system changes."""
from enum import Enum as PyEnum
from typing import Optional
from datetime import datetime, UTC
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ActivityAction(str, PyEnum):
    """Type of action performed."""
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    ARCHIVE = "archive"
    APPROVE = "approve"
    REJECT = "reject"
    STATUS_CHANGE = "status_change"
    LINK = "link"
    UNLINK = "unlink"
    LOGIN = "login"
    FAILED_LOGIN = "failed_login"


class ActivityEntityType(str, PyEnum):
    """Type of entity being tracked."""
    RISK = "risk"
    CONTROL = "control"
    KRI = "kri"
    USER = "user"
    DEPARTMENT = "department"
    APPROVAL = "approval"
    CONTROL_EXECUTION = "control_execution"
    KRI_VALUE = "kri_value"
    CONTROL_RISK_LINK = "control_risk_link"
    ROLE = "role"
    CONFIG = "config"


class ActivityLog(Base):
    """
    Tracks all changes in the system for compliance and auditing.
    
    Each entry represents a single action (create/update/delete) on an entity.
    Entries are immutable - once created, they cannot be modified.
    """
    __tablename__ = "activity_logs"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # What entity was affected
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    entity_name: Mapped[str] = mapped_column(String(255), nullable=False)  # Snapshot for display
    
    # What action was performed
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    
    # Who performed the action
    actor_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    actor_name: Mapped[str] = mapped_column(String(255), nullable=False)  # Snapshot
    
    # Department scoping (for access control filtering)
    department_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("departments.id"), nullable=True, index=True)
    
    # Change details (for updates: {field: {old: value, new: value}})
    changes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    
    # Human-readable description
    description: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Timestamp (immutable)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(UTC), 
        nullable=False,
        index=True
    )
    
    # Relationships
    actor: Mapped[Optional["User"]] = relationship("User", foreign_keys=[actor_id])
    department: Mapped["Department"] = relationship("Department", foreign_keys=[department_id])
    
    # Composite indexes for common queries
    __table_args__ = (
        Index("ix_activity_entity", "entity_type", "entity_id"),
        Index("ix_activity_actor_date", "actor_id", "created_at"),
        Index("ix_activity_dept_date", "department_id", "created_at"),
    )


# Type hints
from app.models.user import User
from app.models.department import Department
