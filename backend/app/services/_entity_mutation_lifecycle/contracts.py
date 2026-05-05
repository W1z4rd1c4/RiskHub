from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.models import ApprovalActionType, ApprovalResourceType
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.user import User

EntityMutationKind = Literal["applied", "approval_queued", "no_op", "blocked"]


@dataclass(frozen=True)
class EntityMutationOutcome:
    kind: EntityMutationKind
    response: Any


@dataclass(frozen=True)
class EntityMutationOptions:
    actor: User
    reload: bool = True
    serialize: bool = True
    allow_direct_apply: bool = True


@dataclass(frozen=True)
class EntityApprovalPlan:
    resource_type: ApprovalResourceType
    action_type: ApprovalActionType
    scenario_key: str | None
    pending_changes: dict[str, Any] | None
    primary_approver_id: int | None
    requires_privileged_approval: bool = False


@dataclass(frozen=True)
class EntityDirectApplyPlan:
    target_updates: dict[str, Any]
    activity_entity_type: ActivityEntityType
    activity_action: ActivityAction
    department_id: int | None
