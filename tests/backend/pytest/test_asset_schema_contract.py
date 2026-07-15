"""Asset relationship and canonical-value foundation for ICT-GOV #75."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy import inspect

from app.models import Asset, Department, OrphanedItem, User
from app.schemas.asset import AssetCreate, AssetRead
from app.schemas.orphaned_item import OrphanedItemCreateInternal, OrphanedItemRead
from app.services._ict_register_reference import (
    ASSET_CONTROLLED_CODES_BY_FIELD,
    asset_controlled_value_code,
)


def _create_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "Claims platform",
        "business_owner_user_id": 12,
        "ict_owner_user_id": 12,
        "owning_department_id": 4,
    }
    payload.update(overrides)
    return payload


def test_asset_model_uses_three_nullable_restrict_relationships_without_legacy_text() -> (
    None
):
    mapper = inspect(Asset)
    columns = Asset.__table__.columns

    for legacy in ("business_owner", "ict_owner", "owner_department"):
        assert legacy not in columns
    for column_name, target in (
        ("business_owner_user_id", "users.id"),
        ("ict_owner_user_id", "users.id"),
        ("owning_department_id", "departments.id"),
    ):
        column = columns[column_name]
        assert column.nullable is True
        assert column.index is True
        foreign_key = next(iter(column.foreign_keys))
        assert foreign_key.target_fullname == target
        assert foreign_key.ondelete == "RESTRICT"

    assert mapper.relationships.business_owner.back_populates == "business_owned_assets"
    assert mapper.relationships.ict_owner.back_populates == "ict_owned_assets"
    assert mapper.relationships.owning_department.back_populates == "assets"
    assert (
        inspect(User).relationships.business_owned_assets.back_populates
        == "business_owner"
    )
    assert inspect(User).relationships.ict_owned_assets.back_populates == "ict_owner"
    assert (
        inspect(Department).relationships.assets.back_populates == "owning_department"
    )


@pytest.mark.parametrize(
    "missing",
    ["business_owner_user_id", "ict_owner_user_id", "owning_department_id"],
)
def test_asset_create_requires_all_accountability_relationships(missing: str) -> None:
    payload = _create_payload()
    payload.pop(missing)

    with pytest.raises(ValidationError):
        AssetCreate.model_validate(payload)


def test_asset_create_allows_same_user_in_both_owner_roles() -> None:
    row = AssetCreate.model_validate(_create_payload())

    assert row.business_owner_user_id == row.ict_owner_user_id == 12


@pytest.mark.parametrize(
    "legacy_field", ["business_owner", "ict_owner", "owner_department"]
)
def test_asset_create_rejects_legacy_responsibility_fields(legacy_field: str) -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        AssetCreate.model_validate(_create_payload(**{legacy_field: "Legacy text"}))


@pytest.mark.parametrize(
    ("field", "workbook_value", "code"),
    [
        ("asset_type", "Cloud služba", "cloud_service"),
        ("asset_level", "A – primární", "primary"),
        ("deployment_model", "Externě hostováno", "externally_hosted"),
        ("gdpr_relevance", "Neurčeno", "undetermined"),
        ("ai_relevance", "Ano", "yes"),
        ("data_classification", "Důvěrná data", "confidential"),
        ("internet_exposed", "Ne", "no"),
        ("preliminary_criticality", "Kritická", "critical"),
        ("lifecycle_state", "Utlumováno", "being_decommissioned"),
        ("review_state", "K revizi", "review_required"),
    ],
)
def test_asset_controlled_values_map_at_import_and_validate_as_codes(
    field: str,
    workbook_value: str,
    code: str,
) -> None:
    assert asset_controlled_value_code(field, workbook_value) == code
    assert asset_controlled_value_code(field, code) == code
    assert code in ASSET_CONTROLLED_CODES_BY_FIELD[field]
    assert (
        getattr(AssetCreate.model_validate(_create_payload(**{field: code})), field)
        == code
    )

    with pytest.raises(ValidationError, match="canonical Asset"):
        AssetCreate.model_validate(_create_payload(**{field: workbook_value}))


def test_asset_read_exposes_safe_dual_owner_department_and_governance_status() -> None:
    row = AssetRead.model_validate(
        {
            "id": 81,
            "name": "Claims platform",
            "business_owner_user_id": 12,
            "business_owner": {
                "name": "Jana Novak",
                "role_name": "employee",
                "department_name": "Claims",
            },
            "ict_owner_user_id": 13,
            "ict_owner": {
                "name": "Petr Novak",
                "role_name": "employee",
                "department_name": "IT",
            },
            "owning_department_id": 4,
            "owning_department": {"name": "Operations", "code": "OPS"},
            "business_owner_orphaned": True,
            "ict_owner_orphaned": False,
            "ownership_status": "pending_governance",
            "created_at": "2026-07-15T12:00:00Z",
            "updated_at": "2026-07-15T12:00:00Z",
        }
    )

    assert row.business_owner is not None
    assert "id" not in row.business_owner.model_dump()
    assert "email" not in row.business_owner.model_dump()
    assert row.ict_owner is not None
    assert "id" not in row.ict_owner.model_dump()
    assert "email" not in row.ict_owner.model_dump()
    assert row.owning_department is not None
    assert row.owning_department.model_dump() == {"name": "Operations", "code": "OPS"}
    assert row.business_owner_orphaned is True
    assert row.ict_owner_orphaned is False
    assert row.ownership_status == "pending_governance"


def test_asset_read_allows_historical_relationship_gaps() -> None:
    row = AssetRead.model_validate(
        {
            "id": 82,
            "name": "Historical",
            "created_at": "2026-07-15T12:00:00Z",
            "updated_at": "2026-07-15T12:00:00Z",
            "ownership_status": "legacy_unassigned",
        }
    )

    assert row.business_owner_user_id is None
    assert row.ict_owner_user_id is None
    assert row.owning_department_id is None


def test_asset_orphan_contract_preserves_roles_independently_and_deduplicates_pending() -> (
    None
):
    role_column = OrphanedItem.__table__.columns.responsibility_role
    pending_role_index = next(
        index
        for index in OrphanedItem.__table__.indexes
        if index.name == "uq_orphaned_items_pending_item_role"
    )

    assert role_column.nullable is True
    assert pending_role_index.unique is True
    assert [column.name for column in pending_role_index.columns] == [
        "item_type",
        "item_id",
        "responsibility_role",
    ]
    assert str(pending_role_index.dialect_options["postgresql"]["where"]) == (
        "status = 'pending' AND responsibility_role IS NOT NULL"
    )
    for responsibility_role in ("business_owner", "ict_owner"):
        internal = OrphanedItemCreateInternal.model_validate(
            {
                "item_type": "asset",
                "item_id": 81,
                "previous_owner_id": 12,
                "responsibility_role": responsibility_role,
            }
        )
        assert internal.responsibility_role == responsibility_role

        read = OrphanedItemRead.model_validate(
            {
                "id": 1,
                "item_type": "asset",
                "item_id": 81,
                "responsibility_role": responsibility_role,
                "previous_owner_id": 12,
                "orphaned_at": "2026-07-15T12:00:00Z",
                "status": "pending",
            }
        )
        assert read.responsibility_role == responsibility_role
