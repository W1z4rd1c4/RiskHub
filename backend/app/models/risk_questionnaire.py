"""Risk questionnaire model for per-risk assessment questionnaires."""
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RiskQuestionnaireStatus(str, PyEnum):
    sent = "sent"
    in_progress = "in_progress"
    submitted = "submitted"


class RiskQuestionnaire(Base):
    """
    Represents a single questionnaire instance "sent" for a risk.

    Immutable history is represented by creating a new row per send.
    """

    __tablename__ = "risk_questionnaires"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    risk_id: Mapped[int] = mapped_column(Integer, ForeignKey("risks.id"), nullable=False, index=True)
    assigned_to_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    sent_by_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    status: Mapped[RiskQuestionnaireStatus] = mapped_column(
        SAEnum(
            RiskQuestionnaireStatus,
            name="risk_questionnaire_status",
            native_enum=False,
            validate_strings=True,
        ),
        nullable=False,
        index=True,
        default=RiskQuestionnaireStatus.sent,
    )

    template_key: Mapped[str] = mapped_column(String(100), nullable=False)
    template_version: Mapped[str] = mapped_column(String(20), nullable=False)
    answers: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    risk: Mapped["Risk"] = relationship("Risk", lazy="selectin")
    assigned_to_user: Mapped["User"] = relationship("User", foreign_keys=[assigned_to_user_id], lazy="selectin")
    sent_by_user: Mapped["User"] = relationship("User", foreign_keys=[sent_by_user_id], lazy="selectin")
    submitted_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[submitted_by_user_id], lazy="selectin")

    __table_args__ = (
        Index("ix_risk_questionnaires_risk_status", "risk_id", "status"),
        Index("ix_risk_questionnaires_assignee_status", "assigned_to_user_id", "status"),
        Index("ix_risk_questionnaires_due_status", "due_at", "status"),
    )


class RiskQuestionnaireClarification(Base):
    """Clarification request per questionnaire section with a single response."""

    __tablename__ = "risk_questionnaire_clarifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    questionnaire_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("risk_questionnaires.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    section_key: Mapped[str] = mapped_column(String(200), nullable=False)
    question_keys: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    request_message: Mapped[str] = mapped_column(Text, nullable=False)
    requested_by_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    response_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    questionnaire: Mapped["RiskQuestionnaire"] = relationship("RiskQuestionnaire", lazy="selectin")
    requested_by_user: Mapped["User"] = relationship("User", foreign_keys=[requested_by_user_id], lazy="selectin")
    responded_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[responded_by_user_id], lazy="selectin")

    __table_args__ = (
        Index("ix_risk_questionnaire_clarifications_questionnaire_section", "questionnaire_id", "section_key"),
    )


# Import for type hints
from app.models.risk import Risk
from app.models.user import User
