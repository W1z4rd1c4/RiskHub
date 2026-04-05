"""Typed payload models for supported outbox events."""

from __future__ import annotations

from typing import TypeAlias

from pydantic import BaseModel, ConfigDict, ValidationError


class OutboxPayloadModel(BaseModel):
    """Base payload model with strict key validation."""

    model_config = ConfigDict(extra="forbid")


class ApprovalRequestCreatedPayload(OutboxPayloadModel):
    approval_id: int


class ApprovalRequestResolvedPayload(OutboxPayloadModel):
    approval_id: int
    approved: bool


class ApprovalRequestCancelledPayload(OutboxPayloadModel):
    approval_id: int
    cancelled_by_user_id: int


class IssueAssignedPayload(OutboxPayloadModel):
    issue_id: int
    owner_user_id: int
    actor_user_id: int


class IssueExceptionRequestedPayload(OutboxPayloadModel):
    issue_id: int
    actor_user_id: int


class IssueExceptionApprovedPayload(OutboxPayloadModel):
    issue_id: int
    actor_user_id: int
    requested_by_id: int | None = None
    owner_user_id: int | None = None


class QuestionnaireSentPayload(OutboxPayloadModel):
    questionnaire_id: int
    actor_user_id: int


class QuestionnaireSubmittedPayload(OutboxPayloadModel):
    questionnaire_id: int
    actor_user_id: int


class QuestionnaireClarificationRequestedPayload(OutboxPayloadModel):
    clarification_id: int
    questionnaire_id: int
    actor_user_id: int


OutboxPayload: TypeAlias = (
    ApprovalRequestCreatedPayload
    | ApprovalRequestResolvedPayload
    | ApprovalRequestCancelledPayload
    | IssueAssignedPayload
    | IssueExceptionRequestedPayload
    | IssueExceptionApprovedPayload
    | QuestionnaireSentPayload
    | QuestionnaireSubmittedPayload
    | QuestionnaireClarificationRequestedPayload
)


OUTBOX_PAYLOAD_MODELS: dict[str, type[OutboxPayloadModel]] = {
    "approval.request_created": ApprovalRequestCreatedPayload,
    "approval.request_resolved": ApprovalRequestResolvedPayload,
    "approval.request_cancelled": ApprovalRequestCancelledPayload,
    "issue.assigned": IssueAssignedPayload,
    "issue.exception_requested": IssueExceptionRequestedPayload,
    "issue.exception_approved": IssueExceptionApprovedPayload,
    "questionnaire.sent": QuestionnaireSentPayload,
    "questionnaire.submitted": QuestionnaireSubmittedPayload,
    "questionnaire.clarification_requested": QuestionnaireClarificationRequestedPayload,
}


def get_outbox_payload_model(event_type: str) -> type[OutboxPayloadModel] | None:
    return OUTBOX_PAYLOAD_MODELS.get(event_type)


def validate_outbox_payload(event_type: str, payload: OutboxPayloadModel | dict) -> OutboxPayloadModel:
    model = get_outbox_payload_model(event_type)
    if model is None:
        raise ValueError(f"Unknown outbox event type: {event_type}")
    if isinstance(payload, model):
        return payload
    if isinstance(payload, OutboxPayloadModel):
        payload = payload.model_dump(mode="json")
    return model.model_validate(payload)


__all__ = [
    "OutboxPayload",
    "OutboxPayloadModel",
    "ApprovalRequestCreatedPayload",
    "ApprovalRequestResolvedPayload",
    "ApprovalRequestCancelledPayload",
    "IssueAssignedPayload",
    "IssueExceptionRequestedPayload",
    "IssueExceptionApprovedPayload",
    "QuestionnaireSentPayload",
    "QuestionnaireSubmittedPayload",
    "QuestionnaireClarificationRequestedPayload",
    "OUTBOX_PAYLOAD_MODELS",
    "ValidationError",
    "get_outbox_payload_model",
    "validate_outbox_payload",
]
