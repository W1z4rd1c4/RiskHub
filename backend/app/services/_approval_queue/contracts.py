from __future__ import annotations

from dataclasses import dataclass

from app.models import ApprovalRequest, ApprovalResourceType
from app.schemas.approval_request import ApprovalRequestListResponse, ApprovalRequestRead


@dataclass(frozen=True)
class ApprovalRequestIntakePlan:
    resource_type: ApprovalResourceType
    resource_id: int
    resource_name: str
    scenario_key: str
    department_id: int | None
    primary_approver_id: int | None
    requires_privileged_approval: bool


@dataclass(frozen=True)
class ApprovalQueueProjection:
    approval: ApprovalRequest
    item: ApprovalRequestRead | None
    skipped_reason: str | None = None


@dataclass(frozen=True)
class ApprovalQueuePage:
    items: list[ApprovalRequestRead]
    total: int
    skip: int
    limit: int
    skipped_corrupt_payloads: int = 0

    def to_response(self) -> ApprovalRequestListResponse:
        return ApprovalRequestListResponse(items=self.items, total=self.total, skip=self.skip, limit=self.limit)
