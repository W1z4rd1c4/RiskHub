"""Approval execution service - handles approval logic extracted from endpoints.

This module provides the core business logic for processing approval requests:
- Authorization checks (primary vs privileged approvers)
- Status transitions (PENDING → PENDING_PRIVILEGED → APPROVED)
- Side effects (DELETE archives, EDIT applies pending_changes)
- Activity logging

The endpoint layer (`approvals.py`) handles HTTP concerns, routing, and orchestration.
"""

from ._approval_execution.authorization import apply_status_transition, assert_can_approve
from ._approval_execution.constants import EDITABLE_FIELDS
from ._approval_execution.delete_side_effects import _apply_delete_side_effects
from ._approval_execution.edit_risk_control import _apply_edit_risk_control
from ._approval_execution.kri_side_effects import (
    _apply_edit_kri,
    _apply_kri_generic_edit,
    _apply_kri_history_correction,
    _apply_kri_value_submission,
    _build_kri_changes,
)
from ._approval_execution.loading import get_approval_department_id, load_approval
from ._approval_execution.logging import log_approval_approve
from ._approval_execution.side_effects import apply_side_effects

__all__ = [
    "EDITABLE_FIELDS",
    "load_approval",
    "get_approval_department_id",
    "assert_can_approve",
    "apply_status_transition",
    "_apply_delete_side_effects",
    "_apply_edit_risk_control",
    "_apply_edit_kri",
    "_apply_kri_history_correction",
    "_apply_kri_value_submission",
    "_apply_kri_generic_edit",
    "_build_kri_changes",
    "apply_side_effects",
    "log_approval_approve",
]
