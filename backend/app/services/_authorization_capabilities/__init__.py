from __future__ import annotations

from app.services._authorization_capabilities.approvals import approval_capabilities
from app.services._authorization_capabilities.controls import control_capabilities
from app.services._authorization_capabilities.issues import issue_capabilities
from app.services._authorization_capabilities.kris import kri_capabilities
from app.services._authorization_capabilities.risks import risk_capabilities
from app.services._authorization_capabilities.vendors import can_view_loaded_vendor, can_view_vendor_link

__all__ = [
    "approval_capabilities",
    "can_view_loaded_vendor",
    "can_view_vendor_link",
    "control_capabilities",
    "issue_capabilities",
    "kri_capabilities",
    "risk_capabilities",
]
