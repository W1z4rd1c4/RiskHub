from sqlalchemy.ext.asyncio import AsyncSession

from app.models.approval_request import ApprovalRequest, ApprovalResourceType
from app.models.user import User
from app.services._approval_notification_candidates import (
    load_approval_notification_candidates,
    load_scenario_approval_notification_candidates,
)
from app.services._governed_mutations.notification_identity import (
    InvalidGovernedProcessNotificationIdentity,
    strict_governed_process_notification_identity,
)
from app.services.approval_scenario_policy import (
    can_resolve_scenario_approval,
    can_view_approval_resource,
)

__all__ = [
    "approval_action_label",
    "eligible_approval_notification_recipients",
    "load_approval_notification_candidates",
    "load_scenario_approval_notification_candidates",
]


def approval_action_label(approval: ApprovalRequest) -> str:
    return "delete" if approval.action_type.value == "delete" else "edit"


async def eligible_approval_notification_recipients(
    db: AsyncSession,
    approval: ApprovalRequest,
    *,
    exclude_user_id: int | None = None,
) -> tuple[list[User], dict[str, int]]:
    candidates = await load_scenario_approval_notification_candidates(db, approval)
    proposal = approval.governed_mutation_proposal
    governed_identity = None
    if proposal is not None:
        try:
            governed_identity = strict_governed_process_notification_identity(proposal)
        except InvalidGovernedProcessNotificationIdentity:
            return [], {"excluded_actor": 0, "hidden_resource": 0}
        if governed_identity is None:
            return [], {"excluded_actor": 0, "hidden_resource": 0}
    recipients: list[User] = []
    skipped = {
        "excluded_actor": 0,
        "hidden_resource": 0,
    }
    for candidate in candidates:
        if exclude_user_id is not None and candidate.id == exclude_user_id:
            skipped["excluded_actor"] += 1
            continue
        can_receive = (
            await can_resolve_scenario_approval(db, candidate, approval)
            if governed_identity is not None
            else (
                await can_resolve_scenario_approval(db, candidate, approval)
                if approval.resource_type == ApprovalResourceType.PROCESS
                else await can_view_approval_resource(db, candidate, approval)
            )
        )
        if not can_receive:
            skipped["hidden_resource"] += 1
            continue
        recipients.append(candidate)
    return recipients, skipped
