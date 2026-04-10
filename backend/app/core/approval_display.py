from __future__ import annotations

from app.models import ApprovalRequest, ApprovalResourceType

_UNKNOWN_RESOURCE_LABELS: dict[str, str] = {
    "risk": "Unknown risk",
    "control": "Unknown control",
    "kri": "Unknown KRI",
}


def unknown_approval_resource_label(resource_type: ApprovalResourceType | str) -> str:
    resource_value = resource_type.value if isinstance(resource_type, ApprovalResourceType) else str(resource_type)
    return _UNKNOWN_RESOURCE_LABELS.get(resource_value.lower(), "Unknown resource")


def approval_resource_label(approval: ApprovalRequest) -> str:
    label = (approval.resource_name or "").strip()
    if label:
        return label
    return unknown_approval_resource_label(approval.resource_type)
