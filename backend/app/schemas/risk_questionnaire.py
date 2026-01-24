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


class RiskQuestionnairePreviousSubmissionRead(BaseModel):
    id: int
    submitted_at: datetime
    template_version: str
    answers: dict[str, object] | None = None


class RiskQuestionnaireRead(RiskQuestionnaireListItemRead):
    answers: dict[str, object] | None = None
    previous_submission: RiskQuestionnairePreviousSubmissionRead | None = None


class RiskQuestionnaireDraftUpdate(BaseModel):
    answers: dict[str, object]


class RiskQuestionnaireSubmit(BaseModel):
    answers: dict[str, object]


class RiskQuestionnaireClarificationCreate(BaseModel):
    section_key: str
    request_message: str
    question_keys: list[str] | None = None


class RiskQuestionnaireClarificationRespond(BaseModel):
    response_message: str


class RiskQuestionnaireClarificationRead(BaseModel):
    id: int
    questionnaire_id: int
    section_key: str
    question_keys: list[str] | None = None

    request_message: str
    requested_by_user_id: int
    requested_by_user_name: str | None = None
    requested_at: datetime

    response_message: str | None = None
    responded_by_user_id: int | None = None
    responded_by_user_name: str | None = None
    responded_at: datetime | None = None

    model_config = {"from_attributes": True}
