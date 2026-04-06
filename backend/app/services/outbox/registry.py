"""Central registry for transactional outbox handlers."""

from __future__ import annotations

from app.services.outbox.handlers.approvals import (
    handle_approval_request_cancelled,
    handle_approval_request_created,
    handle_approval_request_resolved,
)
from app.services.outbox.handlers.common import OutboxHandler
from app.services.outbox.handlers.issues import (
    handle_issue_assigned,
    handle_issue_exception_approved,
    handle_issue_exception_requested,
)
from app.services.outbox.handlers.questionnaires import (
    handle_questionnaire_clarification_requested,
    handle_questionnaire_sent,
    handle_questionnaire_submitted,
)

OUTBOX_EVENT_HANDLERS: dict[str, OutboxHandler] = {
    "approval.request_created": handle_approval_request_created,
    "approval.request_resolved": handle_approval_request_resolved,
    "approval.request_cancelled": handle_approval_request_cancelled,
    "issue.assigned": handle_issue_assigned,
    "issue.exception_requested": handle_issue_exception_requested,
    "issue.exception_approved": handle_issue_exception_approved,
    "questionnaire.sent": handle_questionnaire_sent,
    "questionnaire.submitted": handle_questionnaire_submitted,
    "questionnaire.clarification_requested": handle_questionnaire_clarification_requested,
}

__all__ = ["OUTBOX_EVENT_HANDLERS"]
