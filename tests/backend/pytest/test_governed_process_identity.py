"""Cross-dialect contracts for the immutable governed Process identity."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

import pytest
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    GovernedMutationProposal,
    User,
)
from app.schemas.process import ProcessUpdate
from app.services._governed_mutations.process_identity import (
    PROCESS_DISPLAY_NAME_MAX_LENGTH,
    InvalidGovernedProcessIdentity,
    canonical_process_display_name,
    new_governed_process_proposal,
    strict_governed_process_identity,
    valid_governed_process_proposal_exists_clause,
)


def _writer_kwargs() -> dict[str, Any]:
    return {
        "approval_request_id": 1,
        "requested_by_id": 2,
        "process_id": 3,
        "process_name": "F3 — Claims",
        "approver_roles": ["cro"],
        "base_governance_version": 1,
        "before_snapshot": {"notes": "old"},
        "after_snapshot": {"notes": "new"},
        "raw_before": {"notes": "old"},
        "raw_after": {"notes": "new"},
        "derived_impact_snapshot": {
            "before": {"cif": "yes", "criticality_class": "critical"},
            "after": {"cif": "yes", "criticality_class": "critical"},
        },
    }


def _new_valid_proposal() -> GovernedMutationProposal:
    return new_governed_process_proposal(**_writer_kwargs())


@pytest.mark.parametrize("field", ["l0_area", "l1_process"])
@pytest.mark.parametrize("value", ["", "\t", "\u00a0", "\u2003", "\x00"])
def test_process_update_api_rejects_blank_required_hierarchy_labels(
    field: str,
    value: str,
) -> None:
    with pytest.raises(PydanticValidationError):
        ProcessUpdate.model_validate({field: value})


def _replace_operation(
    proposal: GovernedMutationProposal,
    *,
    before: dict[str, object],
    after: dict[str, object],
) -> None:
    proposal.proposed_changes = {
        "before": deepcopy(before),
        "after": deepcopy(after),
    }
    proposal.before_snapshot = deepcopy(before)
    proposal.after_snapshot = deepcopy(after)


@pytest.mark.parametrize("field", ["proposal_version", "schema_version"])
@pytest.mark.parametrize("invalid_value", [True, 1.0])
def test_strict_identity_rejects_non_plain_integer_versions(
    field: str,
    invalid_value: object,
) -> None:
    proposal = _new_valid_proposal()
    setattr(proposal, field, invalid_value)

    with pytest.raises(InvalidGovernedProcessIdentity):
        strict_governed_process_identity(proposal)


def test_canonical_writer_round_trips_supported_semantics() -> None:
    proposal = _new_valid_proposal()
    identity = strict_governed_process_identity(proposal)

    assert identity is not None
    assert type(proposal.proposal_version) is int
    assert type(proposal.schema_version) is int
    assert identity.primary_resource_id == 3


@pytest.mark.asyncio
async def test_canonical_display_name_writer_respects_live_storage_boundary(
    db_session: AsyncSession,
    test_user_employee: User,
) -> None:
    display_name = canonical_process_display_name("F3", "X" * 255)
    assert len(display_name) == PROCESS_DISPLAY_NAME_MAX_LENGTH
    assert display_name.startswith("F3 — ")

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.PROCESS,
        resource_id=3,
        resource_name=display_name,
        action_type=ApprovalActionType.EDIT,
        pending_changes={"notes": {"old": "old", "new": "new"}},
        requested_by_id=test_user_employee.id,
        reason="Bounded canonical display label",
        status=ApprovalStatus.PENDING,
        scenario_key="protected_process_edit",
        scenario_approver_roles=["cro"],
        requires_privileged_approval=False,
    )
    db_session.add(approval)
    await db_session.flush()
    kwargs = _writer_kwargs()
    kwargs.update(
        approval_request_id=approval.id,
        requested_by_id=test_user_employee.id,
        process_name=display_name,
    )
    proposal = new_governed_process_proposal(**kwargs)
    db_session.add(proposal)
    await db_session.flush()
    assert proposal.primary_resource_name == display_name
    assert proposal.impacted_resources_snapshot[0]["resource_name"] == display_name

    kwargs["process_name"] = "X" * (PROCESS_DISPLAY_NAME_MAX_LENGTH + 1)
    with pytest.raises(InvalidGovernedProcessIdentity):
        new_governed_process_proposal(**kwargs)


@pytest.mark.parametrize(
    "invalid_semantics",
    [
        "l0_null",
        "l1_null",
        "owner_null",
        "department_null",
        "derived_domain",
    ],
)
def test_canonical_writer_rejects_invalid_semantics(
    invalid_semantics: str,
) -> None:
    kwargs = _writer_kwargs()
    if invalid_semantics == "derived_domain":
        kwargs["derived_impact_snapshot"] = {
            "before": {"cif": "yes", "criticality_class": "critical"},
            "after": {"cif": "maybe", "criticality_class": "critical"},
        }
    else:
        field_by_case = {
            "l0_null": "l0_area",
            "l1_null": "l1_process",
            "owner_null": "process_owner_user_id",
            "department_null": "owning_department_id",
        }
        field = field_by_case[invalid_semantics]
        raw_before = 1 if field.endswith("_id") else "Before"
        snapshot_before = "Before identity" if field.endswith("_id") else raw_before
        snapshot_after = "Missing identity" if field.endswith("_id") else None
        kwargs["before_snapshot"] = {field: snapshot_before}
        kwargs["after_snapshot"] = {field: snapshot_after}
        kwargs["raw_before"] = {field: raw_before}
        kwargs["raw_after"] = {field: None}

    with pytest.raises(InvalidGovernedProcessIdentity):
        new_governed_process_proposal(**kwargs)


def _apply_corruption(
    proposal: GovernedMutationProposal,
    corruption: str,
) -> None:
    if corruption == "valid":
        return
    if corruption == "envelope_resource_name_drift":
        return
    if corruption == "uuid":
        proposal.proposal_id = "not-a-canonical-uuid"
    elif corruption == "proposal_version":
        proposal.proposal_version = 2
    elif corruption == "schema_version":
        proposal.schema_version = 2
    elif corruption == "resource_id":
        proposal.primary_resource_id = 0
    elif corruption == "resource_name":
        proposal.primary_resource_name = " "
    elif corruption == "resource_name_leading_space":
        proposal.primary_resource_name = " F3 — Claims"
        proposal.impacted_resources_snapshot[0]["resource_name"] = " F3 — Claims"
    elif corruption == "resource_name_trailing_space":
        proposal.primary_resource_name = "F3 — Claims "
        proposal.impacted_resources_snapshot[0]["resource_name"] = "F3 — Claims "
    elif corruption == "resource_name_overflow":
        proposal.primary_resource_name = "X" * (PROCESS_DISPLAY_NAME_MAX_LENGTH + 1)
        proposal.impacted_resources_snapshot[0]["resource_name"] = proposal.primary_resource_name
    elif corruption == "scenario_array":
        proposal.scenario_snapshot = []
    elif corruption == "scenario_scalar":
        proposal.scenario_snapshot = "protected_process_edit"
    elif corruption == "scenario_null":
        proposal.scenario_snapshot = None
    elif corruption == "scenario_extra_key":
        proposal.scenario_snapshot = {
            **proposal.scenario_snapshot,
            "live_alias": "must-not-be-accepted",
        }
    elif corruption == "scenario_wrong_boolean":
        proposal.scenario_snapshot = {
            **proposal.scenario_snapshot,
            "requires_approval": "true",
        }
    elif corruption == "roles_empty":
        proposal.scenario_snapshot = {
            **proposal.scenario_snapshot,
            "approver_roles": [],
        }
    elif corruption == "roles_duplicate":
        proposal.scenario_snapshot = {
            **proposal.scenario_snapshot,
            "approver_roles": ["cro", "cro"],
        }
    elif corruption == "roles_unknown":
        proposal.scenario_snapshot = {
            **proposal.scenario_snapshot,
            "approver_roles": ["employee"],
        }
    elif corruption == "roles_three":
        proposal.scenario_snapshot = {
            **proposal.scenario_snapshot,
            "approver_roles": ["cro", "risk_manager", "cro"],
        }
    elif corruption == "base_array":
        proposal.base_versions = []
    elif corruption == "base_missing":
        proposal.base_versions = {}
    elif corruption == "base_boolean":
        proposal.base_versions = {"process": True}
    elif corruption == "base_zero":
        proposal.base_versions = {"process": 0}
    elif corruption == "proposed_array":
        proposal.proposed_changes = []
    elif corruption == "proposed_extra_key":
        proposal.proposed_changes = {
            **proposal.proposed_changes,
            "live_alias": {},
        }
    elif corruption == "before_array":
        proposal.proposed_changes = {
            **proposal.proposed_changes,
            "before": [],
        }
    elif corruption == "field_set_mismatch":
        proposal.after_snapshot = {"notes": "new", "l0_area": "Extra"}
    elif corruption == "business_snapshot":
        proposal.before_snapshot = {"notes": "different"}
    elif corruption == "business_snapshot_boolean_integer":
        _replace_operation(
            proposal,
            before={"rto_hours": 2},
            after={"rto_hours": 1},
        )
        proposal.after_snapshot = {"rto_hours": True}
    elif corruption == "noop":
        _replace_operation(
            proposal,
            before={"notes": "same"},
            after={"notes": "same"},
        )
    elif corruption == "unknown_update_field":
        _replace_operation(
            proposal,
            before={"unknown_field": "old"},
            after={"unknown_field": "new"},
        )
    elif corruption == "invalid_update_type":
        _replace_operation(
            proposal,
            before={"impact_client": 1},
            after={"impact_client": "5"},
        )
    elif corruption == "invalid_update_range":
        _replace_operation(
            proposal,
            before={"impact_client": 1},
            after={"impact_client": 9},
        )
    elif corruption == "invalid_controlled_code":
        _replace_operation(
            proposal,
            before={"cif_override": "no"},
            after={"cif_override": "maybe"},
        )
    elif corruption == "invalid_date":
        _replace_operation(
            proposal,
            before={"assessment_date": "2026-02-28"},
            after={"assessment_date": "2026-02-31"},
        )
    elif corruption == "required_l0_null":
        _replace_operation(
            proposal,
            before={"l0_area": "Operations"},
            after={"l0_area": None},
        )
    elif corruption == "required_l0_empty":
        _replace_operation(
            proposal,
            before={"l0_area": "Operations"},
            after={"l0_area": ""},
        )
    elif corruption == "required_l0_whitespace":
        _replace_operation(
            proposal,
            before={"l0_area": "Operations"},
            after={"l0_area": "\u2003"},
        )
    elif corruption == "required_l1_null":
        _replace_operation(
            proposal,
            before={"l1_process": "Claims"},
            after={"l1_process": None},
        )
    elif corruption == "required_l1_empty":
        _replace_operation(
            proposal,
            before={"l1_process": "Claims"},
            after={"l1_process": ""},
        )
    elif corruption == "required_l1_whitespace":
        _replace_operation(
            proposal,
            before={"l1_process": "Claims"},
            after={"l1_process": "\t\u00a0"},
        )
    elif corruption == "valid_historical_owner_null_to_positive":
        proposal.proposed_changes = {
            "before": {"process_owner_user_id": None},
            "after": {"process_owner_user_id": 2},
        }
        proposal.before_snapshot = {"process_owner_user_id": "Unknown user"}
        proposal.after_snapshot = {"process_owner_user_id": "2"}
    elif corruption == "valid_historical_department_null_to_positive":
        proposal.proposed_changes = {
            "before": {"owning_department_id": None},
            "after": {"owning_department_id": 2},
        }
        proposal.before_snapshot = {"owning_department_id": "Unknown department"}
        proposal.after_snapshot = {"owning_department_id": "2"}
    elif corruption == "required_owner_null":
        proposal.proposed_changes = {
            "before": {"process_owner_user_id": 1},
            "after": {"process_owner_user_id": None},
        }
        proposal.before_snapshot = {"process_owner_user_id": "Before owner"}
        proposal.after_snapshot = {"process_owner_user_id": "No owner"}
    elif corruption == "required_owner_zero":
        proposal.proposed_changes = {
            "before": {"process_owner_user_id": 1},
            "after": {"process_owner_user_id": 0},
        }
        proposal.before_snapshot = {"process_owner_user_id": "Before owner"}
        proposal.after_snapshot = {"process_owner_user_id": "No owner"}
    elif corruption == "required_department_null":
        proposal.proposed_changes = {
            "before": {"owning_department_id": 1},
            "after": {"owning_department_id": None},
        }
        proposal.before_snapshot = {"owning_department_id": "Before department"}
        proposal.after_snapshot = {"owning_department_id": "No department"}
    elif corruption == "required_department_zero":
        proposal.proposed_changes = {
            "before": {"owning_department_id": 1},
            "after": {"owning_department_id": 0},
        }
        proposal.before_snapshot = {"owning_department_id": "Before department"}
        proposal.after_snapshot = {"owning_department_id": "No department"}
    elif corruption == "nul_string":
        _replace_operation(
            proposal,
            before={"l1_process": "Old"},
            after={"l1_process": "\x00"},
        )
    elif corruption == "nul_identity_label":
        proposal.proposed_changes = {
            "before": {"process_owner_user_id": 1},
            "after": {"process_owner_user_id": 2},
        }
        proposal.before_snapshot = {"process_owner_user_id": "Before owner"}
        proposal.after_snapshot = {"process_owner_user_id": "\x00"}
    elif corruption == "identity_label_leading_space":
        proposal.proposed_changes = {
            "before": {"process_owner_user_id": 1},
            "after": {"process_owner_user_id": 2},
        }
        proposal.before_snapshot = {"process_owner_user_id": " Before owner"}
        proposal.after_snapshot = {"process_owner_user_id": "After owner"}
    elif corruption == "identity_label_trailing_space":
        proposal.proposed_changes = {
            "before": {"owning_department_id": 1},
            "after": {"owning_department_id": 2},
        }
        proposal.before_snapshot = {"owning_department_id": "Before department"}
        proposal.after_snapshot = {"owning_department_id": "After department "}
    elif corruption == "identity_label_tab":
        proposal.proposed_changes = {
            "before": {"process_owner_user_id": 1},
            "after": {"process_owner_user_id": 2},
        }
        proposal.before_snapshot = {"process_owner_user_id": "Before owner"}
        proposal.after_snapshot = {"process_owner_user_id": "\t"}
    elif corruption == "identity_label_nbsp":
        proposal.proposed_changes = {
            "before": {"owning_department_id": 1},
            "after": {"owning_department_id": 2},
        }
        proposal.before_snapshot = {"owning_department_id": "Before department"}
        proposal.after_snapshot = {"owning_department_id": "\u00a0"}
    elif corruption == "identity_label_unicode_whitespace":
        proposal.proposed_changes = {
            "before": {"process_owner_user_id": 1},
            "after": {"process_owner_user_id": 2},
        }
        proposal.before_snapshot = {"process_owner_user_id": "Before owner"}
        proposal.after_snapshot = {"process_owner_user_id": "\u2003"}
    elif corruption == "valid_numeric_identity_labels":
        proposal.proposed_changes = {
            "before": {"process_owner_user_id": 1},
            "after": {"process_owner_user_id": 2},
        }
        proposal.before_snapshot = {"process_owner_user_id": "1"}
        proposal.after_snapshot = {"process_owner_user_id": "2"}
    elif corruption == "coercible_positive_id_string":
        proposal.proposed_changes = {
            "before": {"process_owner_user_id": 1},
            "after": {"process_owner_user_id": "2"},
        }
        proposal.before_snapshot = {"process_owner_user_id": "Before owner"}
        proposal.after_snapshot = {"process_owner_user_id": "After owner"}
    elif corruption == "coercible_integer_float":
        _replace_operation(
            proposal,
            before={"rto_hours": 1},
            after={"rto_hours": 2.0},
        )
    elif corruption == "coercible_date_number":
        _replace_operation(
            proposal,
            before={"assessment_date": "2026-02-28"},
            after={"assessment_date": 0},
        )
    elif corruption == "coercible_date_numeric_string":
        _replace_operation(
            proposal,
            before={"assessment_date": "2026-02-28"},
            after={"assessment_date": "0"},
        )
    elif corruption == "year_zero_date":
        _replace_operation(
            proposal,
            before={"assessment_date": "2026-02-28"},
            after={"assessment_date": "0000-01-01"},
        )
    elif corruption == "no_op_float_integer":
        _replace_operation(
            proposal,
            before={"rto_hours": 1.0},
            after={"rto_hours": 1},
        )
    elif corruption == "no_op_boolean_integer":
        _replace_operation(
            proposal,
            before={"rto_hours": True},
            after={"rto_hours": 1},
        )
    elif corruption == "valid_reordered_snapshot_keys":
        proposal.proposed_changes = {
            "before": {"notes": "old", "rto_hours": 1},
            "after": {"notes": "new", "rto_hours": 2},
        }
        proposal.before_snapshot = {"rto_hours": 1, "notes": "old"}
        proposal.after_snapshot = {"rto_hours": 2, "notes": "new"}
    elif corruption == "resource_name_tab":
        proposal.primary_resource_name = "\t"
        proposal.impacted_resources_snapshot[0]["resource_name"] = "\t"
    elif corruption == "resource_name_nbsp":
        proposal.primary_resource_name = "\u00a0"
        proposal.impacted_resources_snapshot[0]["resource_name"] = "\u00a0"
    elif corruption == "resource_name_nul":
        proposal.primary_resource_name = "\x00"
        proposal.impacted_resources_snapshot[0]["resource_name"] = "\x00"
    elif corruption.startswith("derived_malformed_"):
        _, _, block, field, value_kind = corruption.split("_", maxsplit=4)
        malformed_values: dict[str, object] = {
            "list": [],
            "object": {"unexpected": "value"},
            "number": 1,
            "boolean": True,
        }
        derived_field = "criticality_class" if field == "criticality" else field
        proposal.derived_impact_snapshot[block][derived_field] = malformed_values[value_kind]
    elif corruption == "derived_scalar":
        proposal.derived_impact_snapshot = "protected"
    elif corruption == "derived_array":
        proposal.derived_impact_snapshot = []
    elif corruption == "derived_scalar_block":
        proposal.derived_impact_snapshot = {
            **proposal.derived_impact_snapshot,
            "before": "protected",
        }
    elif corruption == "derived_missing_block":
        proposal.derived_impact_snapshot = {"before": {"cif": "yes", "criticality_class": "critical"}}
    elif corruption == "derived_extra_block_key":
        proposal.derived_impact_snapshot = {
            **proposal.derived_impact_snapshot,
            "before": {
                **proposal.derived_impact_snapshot["before"],
                "live_alias": "invalid",
            },
        }
    elif corruption == "derived_invalid_cif":
        proposal.derived_impact_snapshot = {
            **proposal.derived_impact_snapshot,
            "after": {
                **proposal.derived_impact_snapshot["after"],
                "cif": None,
            },
        }
    elif corruption == "derived_nul_cif":
        proposal.derived_impact_snapshot = {
            **proposal.derived_impact_snapshot,
            "after": {
                **proposal.derived_impact_snapshot["after"],
                "cif": "\x00",
            },
        }
    elif corruption == "derived_nul_criticality":
        proposal.derived_impact_snapshot = {
            **proposal.derived_impact_snapshot,
            "after": {
                **proposal.derived_impact_snapshot["after"],
                "criticality_class": "\x00",
            },
        }
    elif corruption == "derived_cif_empty":
        proposal.derived_impact_snapshot["after"]["cif"] = ""
    elif corruption == "derived_cif_bogus":
        proposal.derived_impact_snapshot["after"]["cif"] = "maybe"
    elif corruption == "derived_cif_case_variant":
        proposal.derived_impact_snapshot["after"]["cif"] = "Yes"
    elif corruption == "derived_before_cif_bogus":
        proposal.derived_impact_snapshot["before"]["cif"] = "maybe"
    elif corruption == "derived_criticality_empty":
        proposal.derived_impact_snapshot["after"]["criticality_class"] = ""
    elif corruption == "derived_criticality_bogus":
        proposal.derived_impact_snapshot["after"]["criticality_class"] = "severe"
    elif corruption == "derived_criticality_case_variant":
        proposal.derived_impact_snapshot["after"]["criticality_class"] = "Critical"
    elif corruption == "derived_before_criticality_bogus":
        proposal.derived_impact_snapshot["before"]["criticality_class"] = "severe"
    elif corruption == "valid_derived_null_criticality":
        proposal.derived_impact_snapshot["before"]["criticality_class"] = None
        proposal.derived_impact_snapshot["after"]["criticality_class"] = None
    elif corruption == "valid_derived_no_to_yes":
        proposal.derived_impact_snapshot["before"]["cif"] = "no"
        proposal.derived_impact_snapshot["after"]["cif"] = "yes"
    elif corruption == "valid_derived_yes_to_no":
        proposal.derived_impact_snapshot["before"]["cif"] = "yes"
        proposal.derived_impact_snapshot["after"]["cif"] = "no"
    elif corruption == "derived_both_no":
        proposal.derived_impact_snapshot["before"]["cif"] = "no"
        proposal.derived_impact_snapshot["after"]["cif"] = "no"
    elif corruption == "impact_scalar":
        proposal.impacted_resources_snapshot = "process"
    elif corruption == "impact_empty":
        proposal.impacted_resources_snapshot = []
    elif corruption == "impact_extra_key":
        proposal.impacted_resources_snapshot = [{**proposal.impacted_resources_snapshot[0], "live_alias": True}]
    elif corruption == "impact_resource_id":
        proposal.impacted_resources_snapshot = [{**proposal.impacted_resources_snapshot[0], "resource_id": 900_002}]
    elif corruption == "impact_resource_name":
        proposal.impacted_resources_snapshot = [
            {
                **proposal.impacted_resources_snapshot[0],
                "resource_name": "Different process",
            }
        ]
    elif corruption == "impact_base_version":
        proposal.impacted_resources_snapshot = [
            {
                **proposal.impacted_resources_snapshot[0],
                "base_governance_version": 2,
            }
        ]
    elif corruption == "impact_resource_id_boolean":
        proposal.primary_resource_id = 1
        proposal.impacted_resources_snapshot[0]["resource_id"] = True
    elif corruption == "impact_resource_id_float":
        proposal.primary_resource_id = 1
        proposal.impacted_resources_snapshot[0]["resource_id"] = 1.0
    elif corruption == "impact_base_version_boolean":
        proposal.impacted_resources_snapshot[0]["base_governance_version"] = True
    elif corruption == "impact_base_version_float":
        proposal.impacted_resources_snapshot[0]["base_governance_version"] = 1.0
    else:  # pragma: no cover - parametrization is exhaustive
        raise AssertionError(f"Unknown corruption {corruption}")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "corruption",
    [
        "valid",
        "envelope_resource_name_drift",
        "uuid",
        "proposal_version",
        "schema_version",
        "resource_id",
        "resource_name",
        "resource_name_leading_space",
        "resource_name_trailing_space",
        "resource_name_overflow",
        "scenario_array",
        "scenario_scalar",
        "scenario_null",
        "scenario_extra_key",
        "scenario_wrong_boolean",
        "roles_empty",
        "roles_duplicate",
        "roles_unknown",
        "roles_three",
        "base_array",
        "base_missing",
        "base_boolean",
        "base_zero",
        "proposed_array",
        "proposed_extra_key",
        "before_array",
        "field_set_mismatch",
        "business_snapshot",
        "business_snapshot_boolean_integer",
        "noop",
        "unknown_update_field",
        "invalid_update_type",
        "invalid_update_range",
        "invalid_controlled_code",
        "invalid_date",
        "required_l0_null",
        "required_l0_empty",
        "required_l0_whitespace",
        "required_l1_null",
        "required_l1_empty",
        "required_l1_whitespace",
        "valid_historical_owner_null_to_positive",
        "valid_historical_department_null_to_positive",
        "required_owner_null",
        "required_owner_zero",
        "required_department_null",
        "required_department_zero",
        "nul_string",
        "nul_identity_label",
        "identity_label_leading_space",
        "identity_label_trailing_space",
        "identity_label_tab",
        "identity_label_nbsp",
        "identity_label_unicode_whitespace",
        "valid_numeric_identity_labels",
        "coercible_positive_id_string",
        "coercible_integer_float",
        "coercible_date_number",
        "coercible_date_numeric_string",
        "year_zero_date",
        "no_op_float_integer",
        "no_op_boolean_integer",
        "valid_reordered_snapshot_keys",
        "resource_name_tab",
        "resource_name_nbsp",
        "resource_name_nul",
        *[
            f"derived_malformed_{block}_{field}_{value_kind}"
            for block in ("before", "after")
            for field in ("cif", "criticality")
            for value_kind in ("list", "object", "number", "boolean")
        ],
        "derived_scalar",
        "derived_array",
        "derived_scalar_block",
        "derived_missing_block",
        "derived_extra_block_key",
        "derived_invalid_cif",
        "derived_nul_cif",
        "derived_nul_criticality",
        "derived_cif_empty",
        "derived_cif_bogus",
        "derived_cif_case_variant",
        "derived_before_cif_bogus",
        "derived_criticality_empty",
        "derived_criticality_bogus",
        "derived_criticality_case_variant",
        "derived_before_criticality_bogus",
        "valid_derived_null_criticality",
        "valid_derived_no_to_yes",
        "valid_derived_yes_to_no",
        "derived_both_no",
        "impact_scalar",
        "impact_empty",
        "impact_extra_key",
        "impact_resource_id",
        "impact_resource_name",
        "impact_base_version",
        "impact_resource_id_boolean",
        "impact_resource_id_float",
        "impact_base_version_boolean",
        "impact_base_version_float",
    ],
)
async def test_exact_sql_membership_matches_strict_object_parser(
    db_session: AsyncSession,
    test_user_employee: User,
    corruption: str,
) -> None:
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.PROCESS,
        resource_id=900_001,
        resource_name="Identity parity process",
        action_type=ApprovalActionType.EDIT,
        pending_changes={"notes": {"old": "old", "new": "new"}},
        requested_by_id=test_user_employee.id,
        reason="Cross-dialect identity parity",
        status=ApprovalStatus.PENDING,
        scenario_key="protected_process_edit",
        scenario_approver_roles=["cro"],
        requires_privileged_approval=False,
    )
    db_session.add(approval)
    await db_session.flush()
    proposal = new_governed_process_proposal(
        approval_request_id=approval.id,
        requested_by_id=test_user_employee.id,
        process_id=900_001,
        process_name="Identity parity process",
        approver_roles=["cro"],
        base_governance_version=1,
        before_snapshot={"notes": "old"},
        after_snapshot={"notes": "new"},
        raw_before={"notes": "old"},
        raw_after={"notes": "new"},
        derived_impact_snapshot={
            "before": {"cif": "yes", "criticality_class": "critical"},
            "after": {"cif": "yes", "criticality_class": "critical"},
        },
    )
    _apply_corruption(proposal, corruption)
    if corruption == "envelope_resource_name_drift":
        approval.resource_name = "Mutable envelope-only drift"
    try:
        parser_valid = strict_governed_process_identity(proposal) is not None
    except InvalidGovernedProcessIdentity:
        parser_valid = False
    postgres_storage_rejections = {
        "nul_string",
        "nul_identity_label",
        "resource_name_nul",
        "resource_name_overflow",
        "derived_nul_cif",
        "derived_nul_criticality",
    }
    if db_session.bind.dialect.name == "postgresql" and corruption in postgres_storage_rejections:
        assert parser_valid is False
        db_session.add(proposal)
        with pytest.raises(DBAPIError):
            await db_session.flush()
        await db_session.rollback()
        return

    db_session.add(proposal)
    await db_session.flush()
    await db_session.refresh(proposal)
    sql_valid = bool(
        await db_session.scalar(
            select(ApprovalRequest.id).where(
                ApprovalRequest.id == approval.id,
                valid_governed_process_proposal_exists_clause(),
            )
        )
    )

    assert parser_valid is (
        corruption
        in {
            "valid",
            "envelope_resource_name_drift",
            "valid_reordered_snapshot_keys",
            "valid_derived_null_criticality",
            "valid_derived_no_to_yes",
            "valid_derived_yes_to_no",
            "valid_historical_owner_null_to_positive",
            "valid_historical_department_null_to_positive",
            "valid_numeric_identity_labels",
        }
    )
    assert sql_valid is parser_valid
