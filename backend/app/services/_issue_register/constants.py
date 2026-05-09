from __future__ import annotations

from enum import Enum

from app.models.issue import IssueSourceType

UNKNOWN_USER_LABEL = "Unknown user"
UNKNOWN_DEPARTMENT_LABEL = "Unknown department"
UNKNOWN_RISK_LABEL = "Unknown risk"
UNKNOWN_CONTROL_LABEL = "Unknown control"
UNKNOWN_EXECUTION_LABEL = "Unknown execution"
UNKNOWN_KRI_LABEL = "Unknown KRI"
UNKNOWN_VENDOR_LABEL = "Unknown vendor"


def source_type_value(source_type: IssueSourceType | Enum | str | None) -> str:
    if source_type is None:
        return ""
    if isinstance(source_type, Enum):
        return str(source_type.value)
    return str(source_type)
