"""Department metrics from scoped rows and canonical workbook derivations."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import has_permission
from app.models import Asset, Process, User
from app.services._ict_register_lifecycle.asset_policy import asset_visibility_clause
from app.services._ict_register_lifecycle.asset_projection import load_asset_derived_blocks
from app.services._ict_register_lifecycle.policy import process_visibility_clause
from app.services._ict_register_lifecycle.projection import load_process_derived_blocks


@dataclass(frozen=True)
class DepartmentRegisterCounts:
    process_count: int = 0
    critical_process_count: int = 0
    cif_process_count: int = 0
    asset_count: int = 0
    critical_asset_count: int = 0
    legacy_asset_count: int = 0


async def load_department_register_counts(
    db: AsyncSession, *, department_id: int, current_user: User
) -> DepartmentRegisterCounts:
    """Count the live, visible owning-department population without list DTOs.

    The register's criticality/CIF/legacy facets keep the department and live
    filters. Reuse its derivations, including viewer-filtered Asset inputs,
    rather than counting entered fields. Pending proposals affect list metadata,
    not these operational values; rowless creations are outside this population.
    Linked archived rows still follow the canonical derivation loader's rules.
    """
    process_count = critical_process_count = cif_process_count = 0
    if has_permission(current_user, "processes", "read"):
        process_query = select(Process).where(Process.owning_department_id == department_id, Process.live())
        process_visibility = process_visibility_clause(current_user)
        if process_visibility is not None:
            process_query = process_query.where(process_visibility)
        processes = list((await db.execute(process_query)).scalars().all())
        process_blocks = await load_process_derived_blocks(db, processes, current_user=current_user)
        process_count = len(processes)
        critical_process_count = sum(block.criticality_class == "critical" for block in process_blocks.values())
        cif_process_count = sum(block.cif == "yes" for block in process_blocks.values())

    asset_count = critical_asset_count = legacy_asset_count = 0
    if has_permission(current_user, "assets", "read"):
        asset_query = select(Asset).where(Asset.owning_department_id == department_id, Asset.live())
        asset_visibility = asset_visibility_clause(current_user)
        if asset_visibility is not None:
            asset_query = asset_query.where(asset_visibility)
        assets = list((await db.execute(asset_query)).scalars().all())
        asset_blocks = await load_asset_derived_blocks(db, assets, current_user=current_user)
        asset_count = len(assets)
        critical_asset_count = sum(block.resulting_criticality == "critical" for block in asset_blocks.values())
        legacy_asset_count = sum(block.legacy == "yes" for block in asset_blocks.values())

    return DepartmentRegisterCounts(
        process_count=process_count,
        critical_process_count=critical_process_count,
        cif_process_count=cif_process_count,
        asset_count=asset_count,
        critical_asset_count=critical_asset_count,
        legacy_asset_count=legacy_asset_count,
    )
