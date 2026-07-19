"""Shared deterministic lock suffix for governed Process resolutions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.models import Department, Process
from app.models.approval_scenario import ApprovalScenario
from app.services._ict_register_reference.parameters import (
    IctWorkbookParameterSet,
    load_ict_workbook_parameter_set_for_update,
)

from .fixed_policy import load_fixed_process_scenario_for_update


@dataclass(frozen=True, slots=True)
class GovernedProcessResolutionLocks:
    departments: dict[int, Department]
    processes: dict[int, Process]
    parameters: IctWorkbookParameterSet
    scenario: ApprovalScenario


async def lock_governed_process_resolution_suffix(
    db: AsyncSession,
    *,
    process_ids: Iterable[int],
    additional_department_ids: Iterable[int] = (),
    process_options: tuple[Any, ...] = (),
) -> GovernedProcessResolutionLocks:
    """Lock Department -> Process -> parameters -> scenario exactly once.

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

    parameters = await load_ict_workbook_parameter_set_for_update(db)
    scenario = await load_fixed_process_scenario_for_update(db)
    return GovernedProcessResolutionLocks(
        departments={department.id: department for department in departments},
        processes={process.id: process for process in processes},
        parameters=parameters,
        scenario=scenario,
    )


__all__ = ["GovernedProcessResolutionLocks", "lock_governed_process_resolution_suffix"]
