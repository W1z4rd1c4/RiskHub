from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalResourceType,
    ApprovalStatus,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Process,
)

_PROPOSAL_SNAPSHOT_COLUMNS = {
    "scenario_snapshot",
    "base_versions",
    "before_snapshot",
    "after_snapshot",
    "derived_impact_snapshot",
    "proposed_changes",
    "impacted_resources_snapshot",
}


def test_governed_mutation_models_expose_versioned_proposal_and_active_impact_lock() -> None:
    proposal_columns = {column.key for column in inspect(GovernedMutationProposal).columns}
    lock_columns = {column.key for column in inspect(GovernedMutationImpactLock).columns}

    assert {
        "proposal_id",
        "proposal_version",
        "approval_request_id",
        "scenario_snapshot",
        "base_versions",
        "before_snapshot",
        "after_snapshot",
        "derived_impact_snapshot",
        "proposed_changes",
        "impacted_resources_snapshot",
        "requested_by_id",
        "created_at",
    } <= proposal_columns
    assert {
        "proposal_id",
        "resource_type",
        "resource_id",
        "base_governance_version",
        "released_at",
        "release_reason",
    } <= lock_columns
    assert any(
        index.name == "ux_governed_mutation_active_impact"
        for index in inspect(GovernedMutationImpactLock).local_table.indexes
    )


def test_process_and_approval_enums_support_governed_mutation_lifecycle() -> None:
    assert "governance_version" in {column.key for column in inspect(Process).columns}
    assert ApprovalResourceType.PROCESS.value == "process"
    assert ApprovalStatus.EXPIRED.value == "EXPIRED"


def test_governed_mutation_migration_is_forward_only_and_seeds_fixed_scenario() -> None:
    root = Path(__file__).resolve().parents[3]
    migration_path = root / "backend/alembic/versions/m3n4o5p6q7r8_add_governed_mutation_tracer.py"
    spec = importlib.util.spec_from_file_location("governed_mutation_migration", migration_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    source = migration_path.read_text(encoding="utf-8")
    assert module.down_revision == "k2f3g4h5i6j7"
    assert "protected_process_edit" in source
    assert "ux_governed_mutation_active_impact" in source
    assert "GOVERNED_APPROVAL_ACTION_REQUIRED" in source
    assert "GOVERNED_APPROVAL_REQUEST_UPDATES" in source
    assert "governed_mutation_proposals_insert_only" in source
    assert "BEFORE UPDATE OR DELETE ON governed_mutation_proposals" in source
    assert "reject_governed_mutation_proposal_mutation" in source
    assert isinstance(
        module.GOVERNED_MUTATION_SNAPSHOT_TYPE.dialect_impl(postgresql.dialect()),
        postgresql.JSONB,
    )
    with pytest.raises(NotImplementedError, match="ADR-010"):
        module.downgrade()


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_migrated_proposal_snapshot_types_match_model_jsonb(
    db_session: AsyncSession,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL migration type introspection")

    model_columns = inspect(GovernedMutationProposal).columns
    assert {
        name
        for name in _PROPOSAL_SNAPSHOT_COLUMNS
        if isinstance(
            model_columns[name].type.dialect_impl(postgresql.dialect()),
            postgresql.JSONB,
        )
    } == _PROPOSAL_SNAPSHOT_COLUMNS

    migrated_types = dict(
        (
            await db_session.execute(
                text(
                    """
                    SELECT column_name, udt_name
                    FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'governed_mutation_proposals'
                      AND column_name = ANY(:column_names)
                    """
                ),
                {"column_names": sorted(_PROPOSAL_SNAPSHOT_COLUMNS)},
            )
        ).all()
    )
    assert migrated_types == {
        name: "jsonb" for name in _PROPOSAL_SNAPSHOT_COLUMNS
    }
