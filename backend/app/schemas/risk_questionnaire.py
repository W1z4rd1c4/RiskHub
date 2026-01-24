"""Pydantic schemas for risk questionnaires."""
from enum import Enum
from datetime import datetime

from pydantic import BaseModel


class RiskQuestionnaireStatusEnum(str, Enum):
    sent = "sent"
    in_progress = "in_progress"
    submitted = "submitted"


class RiskQuestionnaireListItemRead(BaseModel):
    id: int
    risk_id: int
    risk_name: str | None = None
    assigned_to_user_id: int
    sent_by_user_id: int
    status: RiskQuestionnaireStatusEnum
    template_key: str
    template_version: str
    sent_at: datetime
    due_at: datetime
    submitted_at: datetime | None = None
    submitted_by_user_id: int | None = None

    assigned_to_user_name: str | None = None
    sent_by_user_name: str | None = None
    submitted_by_user_name: str | None = None

    model_config = {"from_attributes": True}


class RiskQuestionnaireRead(RiskQuestionnaireListItemRead):
    answers: dict[str, object] | None = None


class RiskQuestionnaireDraftUpdate(BaseModel):
    answers: dict[str, object]


class RiskQuestionnaireSubmit(BaseModel):
    answers: dict[str, object]
