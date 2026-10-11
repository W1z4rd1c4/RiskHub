"""Shared control execution workflow helpers."""

from .capabilities import control_capabilities as control_capabilities
from .link_governance import (
    ControlExecutionListOutcome as ControlExecutionListOutcome,
)
from .link_governance import (
    ControlExecutionProjection as ControlExecutionProjection,
)
from .link_governance import (
    ControlRiskAccessDecision as ControlRiskAccessDecision,
)
from .link_governance import (
    ControlRiskLinkOutcome as ControlRiskLinkOutcome,
)
from .link_governance import (
    create_control_execution_projection as create_control_execution_projection,
)
from .link_governance import (
    create_control_risk_link as create_control_risk_link,
)
from .link_governance import (
    create_risk_control_link as create_risk_control_link,
)
from .link_governance import (
    delete_control_risk_link as delete_control_risk_link,
)
from .link_governance import (
    delete_risk_control_link as delete_risk_control_link,
)
from .link_governance import (
    list_control_execution_projections as list_control_execution_projections,
)
from .link_governance import (
    list_control_risk_links as list_control_risk_links,
)
from .link_governance import (
    list_risk_control_links as list_risk_control_links,
)
from .link_governance import (
    read_control_execution_projection as read_control_execution_projection,
)
from .workflow import (
    calculate_next_scheduled as calculate_next_scheduled,
)
from .workflow import (
    control_is_executable as control_is_executable,
)
from .workflow import (
    create_execution_record as create_execution_record,
)
from .workflow import (
    linked_risk_names_for_visible_ids as linked_risk_names_for_visible_ids,
)
from .workflow import (
    load_control_for_execution as load_control_for_execution,
)
from .workflow import (
    load_execution_with_context as load_execution_with_context,
)
from .workflow import (
    visible_linked_risk_names as visible_linked_risk_names,
)

# Caller-facing names are declared once; internal implementation files may move.
CALLER_EXPORTS = {
    "calculate_next_scheduled": ("service",),
    "control_capabilities": ("service",),
    "control_is_executable": ("service",),
    "ControlExecutionListOutcome": ("service", "endpoint"),
    "ControlExecutionProjection": ("service", "endpoint"),
    "ControlRiskAccessDecision": ("service", "endpoint"),
    "ControlRiskLinkOutcome": ("service", "endpoint"),
    "create_control_execution_projection": ("service", "endpoint"),
    "create_execution_record": ("service", "record_adapter"),
    "create_control_risk_link": ("service", "endpoint"),
    "create_risk_control_link": ("service", "endpoint"),
    "delete_control_risk_link": ("service", "endpoint"),
    "delete_risk_control_link": ("service", "endpoint"),
    "linked_risk_names_for_visible_ids": ("service",),
    "list_control_execution_projections": ("service", "endpoint"),
    "list_control_risk_links": ("service", "endpoint"),
    "list_risk_control_links": ("service", "endpoint"),
    "load_control_for_execution": ("service", "record_adapter"),
    "load_execution_with_context": ("service",),
    "read_control_execution_projection": ("service", "endpoint"),
    "visible_linked_risk_names": ("service",),
}

CALLER_ROLES = {
    "app.api.v1.endpoints.controls.executions": "record_adapter",
}

CALLER_FACADES = ()

__all__ = list(CALLER_EXPORTS)
