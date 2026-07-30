"""Shared deterministic lock suffix for governed Process resolutions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.models import Asset, Department, Process, Vendor
from app.models.approval_scenario import ApprovalScenario
from app.services._ict_register_reference.parameters import (
    IctWorkbookParameterSet,
    load_ict_workbook_parameter_set_for_update,
)

from .fixed_accountability_policy import ACCOUNTABILITY_SCENARIO_KEY
from .fixed_asset_policy import ASSET_SCENARIO_KEY
from .fixed_policy import SCENARIO_KEY
from .fixed_vendor_policy import VENDOR_SCENARIO_KEY


@dataclass(frozen=True, slots=True)
class GovernedProcessResolutionLocks:
    departments: dict[int, Department]
    processes: dict[int, Process]
    assets: dict[int, Asset]
    vendors: dict[int, Vendor]
    parameters: IctWorkbookParameterSet
    scenario: ApprovalScenario
    scenarios: dict[str, ApprovalScenario]


async def lock_governed_assets_for_resolution(
    db: AsyncSession,
    *,
    asset_ids: Iterable[int],
) -> list[Asset]:
    """Acquire the canonical ordered Asset-row segment of the lock plan."""
    return list(
        (
            await db.execute(
                select(Asset)
                .where(Asset.id.in_(sorted(set(asset_ids))))
                .order_by(Asset.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )


async def lock_governed_process_resolution_suffix(
    db: AsyncSession,
    *,
    process_ids: Iterable[int],
    asset_ids: Iterable[int] = (),
    vendor_ids: Iterable[int] = (),
    additional_department_ids: Iterable[int] = (),
    process_options: tuple[Any, ...] = (),
    scenario_keys: Iterable[str] = (SCENARIO_KEY,),
) -> GovernedProcessResolutionLocks:
    """Lock Department -> Process -> Asset -> Vendor -> parameters -> scenario exactly once.

    Actor, Role, approval-envelope, proposal, and impact locks are acquired by
    callers before entering this shared suffix. Department snapshots are
    verified after Process locking so a concurrent reassignment cannot cross
    the canonical order unnoticed.
    """
    ordered_process_ids = sorted(set(process_ids))
    process_department_snapshot = dict(
        (
            await db.execute(
                select(Process.id, Process.owning_department_id)
                .where(Process.id.in_(ordered_process_ids))
                .order_by(Process.id)
            )
        ).all()
    )
    department_ids = sorted(
        set(additional_department_ids)
        | {department_id for department_id in process_department_snapshot.values() if department_id is not None}
    )
    departments = list(
        (
            await db.execute(
                select(Department)
                .where(Department.id.in_(department_ids))
                .order_by(Department.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )

    statement = (
        select(Process)
        .where(Process.id.in_(ordered_process_ids))
        .order_by(Process.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if process_options:
        statement = statement.options(*process_options)
    processes = list((await db.execute(statement)).unique().scalars().all())
    if any(process.owning_department_id != process_department_snapshot.get(process.id) for process in processes):
        raise ConflictError(
            "Process Department changed concurrently; retry",
            code="process_concurrent_mutation",
        )

    assets = await lock_governed_assets_for_resolution(
        db,
        asset_ids=asset_ids,
    )
    vendors = list(
        (
            await db.execute(
                select(Vendor)
                .where(Vendor.id.in_(sorted(set(vendor_ids))))
                .order_by(Vendor.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )

    parameters = await load_ict_workbook_parameter_set_for_update(db)
    requested_scenario_keys = tuple(scenario_keys)
    ordered_scenario_keys = sorted(set(requested_scenario_keys))
    if not ordered_scenario_keys or not set(ordered_scenario_keys).issubset(
        {
            SCENARIO_KEY,
            ASSET_SCENARIO_KEY,
            VENDOR_SCENARIO_KEY,
            ACCOUNTABILITY_SCENARIO_KEY,
        }
    ):
        raise ConflictError("Governed mutation scenario plan is invalid")
    scenarios = list(
        (
            await db.execute(
                select(ApprovalScenario)
                .where(ApprovalScenario.key.in_(ordered_scenario_keys))
                .order_by(ApprovalScenario.key)
                .with_for_update()
            )
        ).scalars()
    )
    scenarios_by_key = {scenario.key: scenario for scenario in scenarios}
    if set(scenarios_by_key) != set(ordered_scenario_keys):
        raise ConflictError("Governed mutation approval scenario is missing")
    return GovernedProcessResolutionLocks(
        departments={department.id: department for department in departments},
        processes={process.id: process for process in processes},
        assets={asset.id: asset for asset in assets},
        vendors={vendor.id: vendor for vendor in vendors},
        parameters=parameters,
        scenario=scenarios_by_key[requested_scenario_keys[0]],
        scenarios=scenarios_by_key,
    )


__all__ = ["GovernedProcessResolutionLocks", "lock_governed_process_resolution_suffix"]
