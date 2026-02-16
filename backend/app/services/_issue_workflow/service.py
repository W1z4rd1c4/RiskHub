from __future__ import annotations

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Issue, IssueException, User

from .assignment import assign_issue as _assign_issue
from .closure import close_issue as _close_issue
from .exceptions import approve_exception as _approve_exception
from .exceptions import request_exception as _request_exception
from .exceptions import revoke_exception as _revoke_exception
from .remediation import start_remediation as _start_remediation
from .remediation import update_progress as _update_progress
from .transitions import (
    ISSUE_TRANSITIONS,
    REMEDIATION_TRANSITIONS,
    _ensure_issue_transition,
    _ensure_remediation_transition,
    _get_or_init_remediation,
)


class IssueWorkflowService:
    ISSUE_TRANSITIONS: dict[str, set[str]] = ISSUE_TRANSITIONS
    REMEDIATION_TRANSITIONS: dict[str, set[str]] = REMEDIATION_TRANSITIONS

    _ensure_issue_transition = staticmethod(_ensure_issue_transition)
    _ensure_remediation_transition = staticmethod(_ensure_remediation_transition)
    _get_or_init_remediation = staticmethod(_get_or_init_remediation)

    assign_issue = staticmethod(_assign_issue)
    start_remediation = staticmethod(_start_remediation)
    update_progress = staticmethod(_update_progress)

    request_exception = staticmethod(_request_exception)
    approve_exception = staticmethod(_approve_exception)
    revoke_exception = staticmethod(_revoke_exception)

    close_issue = staticmethod(_close_issue)

    async def __call__(self) -> None:  # pragma: no cover
        raise NotImplementedError


# Explicit re-export for type checkers / imports expecting these names.
__all__ = [
    "IssueWorkflowService",
    "Issue",
    "IssueException",
    "User",
    "AsyncSession",
    "datetime",
]

