"""BE-N2: ActorPayloadModel base introduces shared actor_user_id field."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.contract

from app.services.outbox import payloads


def test_actor_payload_model_base_shape() -> None:
    assert hasattr(payloads, "ActorPayloadModel")
    ActorPayloadModel = payloads.ActorPayloadModel
    OutboxPayloadModel = payloads.OutboxPayloadModel

    assert ActorPayloadModel.__bases__ == (OutboxPayloadModel,)
    field = ActorPayloadModel.model_fields["actor_user_id"]
    assert field.annotation is int


@pytest.mark.parametrize(
    "cls",
    [
        "IssueAssignedPayload",
        "IssueExceptionRequestedPayload",
        "IssueExceptionApprovedPayload",
        "QuestionnaireSentPayload",
        "QuestionnaireSubmittedPayload",
        "QuestionnaireClarificationRequestedPayload",
    ],
)
def test_actor_payload_inherits(cls) -> None:
    assert hasattr(payloads, "ActorPayloadModel")
    assert payloads.ActorPayloadModel in getattr(payloads, cls).__mro__


@pytest.mark.parametrize(
    "cls",
    [
        "ApprovalRequestCreatedPayload",
        "ApprovalRequestResolvedPayload",
        "ApprovalRequestCancelledPayload",
    ],
)
def test_approval_payload_does_not_inherit_actor_base(cls) -> None:
    assert hasattr(payloads, "ActorPayloadModel")
    assert payloads.ActorPayloadModel not in getattr(payloads, cls).__mro__
