from __future__ import annotations

from app.core.security import check_permission
from app.models import User
from app.models.role import RoleType

VENDOR_REPORT_ROLES = {
    RoleType.RISK_MANAGER.value,
    RoleType.CRO.value,
    RoleType.COMPLIANCE.value,
    RoleType.INTERNAL_AUDIT.value,
}


def can_access_vendor_reports(current_user: User) -> bool:
    role_name = getattr(getattr(current_user, "role", None), "name", None)
    return bool(check_permission(current_user, "reports", "read") and role_name in VENDOR_REPORT_ROLES)


def vendor_report_capabilities(current_user: User) -> dict[str, bool]:
    can_read = can_access_vendor_reports(current_user)
    can_use_department_filter = bool(can_read and check_permission(current_user, "departments", "read"))
    return {
        "can_read": can_read,
        "can_download_annual_report": can_read,
        "can_download_dora_register": can_read,
        "can_use_department_filter": can_use_department_filter,
    }
