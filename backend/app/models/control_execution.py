from enum import Enum as PyEnum
from datetime import datetime
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ExecutionResult(str, PyEnum):
    """Result of a control execution."""
    passed = "passed"
    failed = "failed"
    warning = "warning"
    not_applicable = "not_applicable"


class ControlExecution(Base):
    """
    Tracks when controls are executed for audit trail purposes.
    
    Enables requirement: "aby vedúci pracovník/MŘŘ/Auditor vedel overiť vykonanie kontroly"
    """
    __tablename__ = "control_executions"
    
    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True)
    
    # Control that was executed
    control_id: Mapped[int] = mapped_column(ForeignKey("controls.id"), index=True)
    control: Mapped["Control"] = relationship("Control", back_populates="executions")
    
    # Who executed the control
    executed_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    executed_by: Mapped["User"] = relationship("User", back_populates="executed_controls")
    
    # When the control was executed
    executed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    
    # Result of the execution
    result: Mapped[str] = mapped_column(String(20), default=ExecutionResult.passed.value)
    
    # Findings/issues discovered during execution
    findings: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Link or path to evidence documents
    evidence_reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Additional notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # When the next execution is scheduled
    next_scheduled: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    # Timestamp
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# Import for type hints
from app.models.control import Control
from app.models.user import User
