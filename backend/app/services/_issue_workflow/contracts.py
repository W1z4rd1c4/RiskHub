from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models import IssueException
from app.schemas.issue import IssueExceptionRead, IssueRead


@dataclass(frozen=True)
class IssueWorkflowOutcome:
    response: IssueRead | IssueExceptionRead


@dataclass(frozen=True)
class IssueUpdatePlan:
    updates: dict[str, Any]
    source_link_requested: bool


@dataclass(frozen=True)
class IssueExceptionSelection:
    exception: IssueException | None


@dataclass(frozen=True)
class IssueOutboxPlan:
    event_type: str
    aggregate_type: str
    aggregate_id: int
    idempotency_key: str
    payload: dict[str, Any]
