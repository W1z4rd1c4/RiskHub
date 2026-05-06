from __future__ import annotations

from app.services._authorization_capabilities.approvals import approval_capabilities
from app.services._authorization_capabilities.controls import control_capabilities
from app.services._authorization_capabilities.issues import issue_capabilities
from app.services._authorization_capabilities.kris import kri_capabilities
from app.services._authorization_capabilities.perimeter import has_capability, require_capability
from app.services._authorization_capabilities.riskhub_config import (
    approval_scenario_capabilities,
    department_capabilities,
    risk_type_capabilities,
    role_capabilities,
)
from app.services._authorization_capabilities.risks import risk_capabilities
from app.services._authorization_capabilities.vendors import can_view_loaded_vendor, can_view_vendor_link

__all__ = [
    "approval_capabilities",
    "approval_scenario_capabilities",
    "can_view_loaded_vendor",
    "can_view_vendor_link",
    "control_capabilities",
    "department_capabilities",
    "has_capability",
    "issue_capabilities",
    "kri_capabilities",
    "risk_capabilities",
    "risk_type_capabilities",
    "require_capability",
    "role_capabilities",
]
