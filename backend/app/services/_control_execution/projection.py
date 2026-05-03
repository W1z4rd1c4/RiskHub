from __future__ import annotations

from dataclasses import dataclass

from app.models import ControlExecution, ControlRiskLink
from app.services._monitoring_response import MonitoringResponseContext


@dataclass(frozen=True)
class ControlExecutionProjection:
    execution: ControlExecution
    executed_by_name: str
    control_name: str
    control_owner_name: str
    linked_risks: list[str]


@dataclass(frozen=True)
class ControlRiskLinkOutcome:
    link: ControlRiskLink
    monitoring_context: MonitoringResponseContext
