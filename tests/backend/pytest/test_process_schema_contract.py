"""Process relationship and canonical-value foundation for ICT-GOV #74."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy import inspect

from app.models import Process
from app.schemas.process import ProcessCreate, ProcessRead
from app.services._ict_register_reference import (
    PROCESS_CONTROLLED_CODES_BY_FIELD,
    process_controlled_value_code,
)


def _create_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "l0_area": "Operations",
        "l1_process": "Claims handling",
        "process_owner_user_id": 12,
        "owning_department_id": 4,
    }
    payload.update(overrides)
    return payload


def test_process_model_uses_nullable_restrict_relationships_without_legacy_text() -> None:
    mapper = inspect(Process)
    columns = Process.__table__.columns

    assert "owner" not in columns
    assert "owner_department" not in columns
    assert columns.process_owner_user_id.nullable is True
    assert columns.owning_department_id.nullable is True
    assert columns.process_owner_user_id.index is True
    assert columns.owning_department_id.index is True
    assert next(iter(columns.process_owner_user_id.foreign_keys)).target_fullname == "users.id"
    assert next(iter(columns.process_owner_user_id.foreign_keys)).ondelete == "RESTRICT"
    assert next(iter(columns.owning_department_id.foreign_keys)).target_fullname == "departments.id"
    assert next(iter(columns.owning_department_id.foreign_keys)).ondelete == "RESTRICT"
    assert mapper.relationships.process_owner.back_populates == "owned_processes"
    assert mapper.relationships.owning_department.back_populates == "processes"


@pytest.mark.parametrize("missing", ["process_owner_user_id", "owning_department_id"])
def test_process_create_requires_both_accountability_relationships(missing: str) -> None:
    payload = _create_payload()
    payload.pop(missing)

    with pytest.raises(ValidationError):
        ProcessCreate.model_validate(payload)


@pytest.mark.parametrize("legacy_field", ["owner", "owner_department"])
def test_process_create_rejects_legacy_owner_fields(legacy_field: str) -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        ProcessCreate.model_validate(_create_payload(**{legacy_field: "Legacy text"}))


@pytest.mark.parametrize(
    ("field", "workbook_value", "code"),
    [
        ("preliminary_criticality", "Kritická", "critical"),
        ("cif_override", "Ano", "yes"),
        ("licensed_activity", "Podpůrné funkce", "support_functions"),
        ("bcm_link", "Nerelevantní", "not_applicable"),
        ("dr_test_result", "S výhradami", "qualified"),
        ("interruption_impact", "Neposouzeno", "not_assessed"),
    ],
)
def test_process_controlled_values_map_at_import_and_validate_as_codes(
    field: str,
    workbook_value: str,
    code: str,
) -> None:
    assert process_controlled_value_code(field, workbook_value) == code
    assert process_controlled_value_code(field, code) == code
    assert code in PROCESS_CONTROLLED_CODES_BY_FIELD[field]
    assert getattr(ProcessCreate.model_validate(_create_payload(**{field: code})), field) == code

    with pytest.raises(ValidationError, match="canonical Process"):
        ProcessCreate.model_validate(_create_payload(**{field: workbook_value}))


def test_process_read_exposes_safe_owner_department_and_governance_status() -> None:
    row = ProcessRead.model_validate(
        {
            "id": 81,
            "f_code": "F81",
            "l0_area": "Operations",
            "l1_process": "Claims handling",
            "process_owner_user_id": 12,
            "process_owner": {
                "name": "Jana Novak",
                "email": "jana@example.test",
                "role_name": "employee",
                "department_name": "Claims",
            },
            "owning_department_id": 4,
            "owning_department": {"name": "Operations", "code": "OPS"},
            "owner_orphaned": True,
            "ownership_status": "pending_governance",
            "created_at": "2026-07-15T12:00:00Z",
            "updated_at": "2026-07-15T12:00:00Z",
        }
    )

    assert row.process_owner is not None
    assert row.process_owner.model_dump() == {
        "name": "Jana Novak",
        "email": "jana@example.test",
        "role_name": "employee",
        "department_name": "Claims",
    }
    assert "id" not in row.process_owner.model_dump()
    assert row.owning_department is not None
    assert row.owning_department.model_dump() == {"name": "Operations", "code": "OPS"}
    assert row.ownership_status == "pending_governance"


def test_process_read_allows_historical_relationship_gaps() -> None:
    row = ProcessRead.model_validate(
        {
            "id": 82,
            "f_code": "F82",
            "l0_area": "Operations",
            "l1_process": "Historical",
            "created_at": "2026-07-15T12:00:00Z",
            "updated_at": "2026-07-15T12:00:00Z",
            "ownership_status": "legacy_unassigned",
        }
    )

    assert row.process_owner_user_id is None
    assert row.process_owner is None
    assert row.owning_department_id is None
    assert row.owning_department is None
