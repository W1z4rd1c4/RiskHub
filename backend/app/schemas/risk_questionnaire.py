"""Pydantic schemas for risk questionnaires."""

from enum import Enum

from pydantic import BaseModel

from app.core.datetime_utils import UtcAwareDatetime


class RiskQuestionnaireStatusEnum(str, Enum):
    sent = "sent"
    in_progress = "in_progress"
    submitted = "submitted"


class RiskQuestionnaireCapabilitiesRead(BaseModel):
    can_open: bool = False
    can_save_draft: bool = False
    can_submit: bool = False
    can_request_clarification: bool = False
    can_respond_to_clarifications: bool = False


class RiskQuestionnaireListItemRead(BaseModel):
    id: int
    risk_id: int
    risk_name: str | None = None
    assigned_to_user_id: int
    sent_by_user_id: int
    status: RiskQuestionnaireStatusEnum
    template_key: str
    template_version: str
    sent_at: UtcAwareDatetime
    due_at: UtcAwareDatetime
    submitted_at: UtcAwareDatetime | None = None
    submitted_by_user_id: int | None = None

    assigned_to_user_name: str | None = None
    sent_by_user_name: str | None = None
    submitted_by_user_name: str | None = None
    capabilities: RiskQuestionnaireCapabilitiesRead | None = None

    model_config = {"from_attributes": True}


class RiskQuestionnairePreviousSubmissionRead(BaseModel):
    id: int
    submitted_at: UtcAwareDatetime
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
    requested_at: UtcAwareDatetime

    response_message: str | None = None
    responded_by_user_id: int | None = None
    responded_by_user_name: str | None = None
    responded_at: UtcAwareDatetime | None = None

    model_config = {"from_attributes": True}
