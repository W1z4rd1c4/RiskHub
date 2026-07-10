from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.security import check_permission
from app.models import Process, User
from app.schemas.process import (
    ProcessDerived,
    ProcessListCapabilities,
    ProcessListResponse,
    ProcessRead,
)
from app.services._authorization_capabilities import process_capabilities
from app.services._ict_register_reference.parameters import load_ict_workbook_parameter_set

from .derivation import derive_ict_register
from .derivation_inputs import load_ict_register_graph

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


async def load_process_derived_blocks(
    db: "AsyncSession", processes: list[Process]
) -> dict[int, ProcessDerived]:
    """Compute the engine-derived block for each Process (compute-on-read).

    One parameter-set load and one graph load per page — register scale is
    hundreds of rows, and the workbook itself recomputes on every open.
    """
    if not processes:
        return {}
    parameters = await load_ict_workbook_parameter_set(db)
    graph = await load_ict_register_graph(db, processes=processes)
    derivation = derive_ict_register(graph, parameters)
    return {
        process.id: ProcessDerived.model_validate(derivation.processes[process.id])
        for process in processes
    }


def serialize_process_detail(
    process: Process,
    *,
    current_user: User,
    derived: ProcessDerived | None = None,
) -> ProcessRead:
    base = ProcessRead.model_validate(process)
    return base.model_copy(
        update={
            "capabilities": process_capabilities(current_user, process),
            "derived": derived,
        }
    )


async def serialize_process_detail_with_derived(
    db: "AsyncSession",
    process: Process,
    *,
    current_user: User,
) -> ProcessRead:
    blocks = await load_process_derived_blocks(db, [process])
    return serialize_process_detail(process, current_user=current_user, derived=blocks[process.id])


def build_process_collection_capabilities(current_user: User) -> ProcessListCapabilities:
    return ProcessListCapabilities(can_create=check_permission(current_user, "processes", "write"))


async def serialize_process_list(
    db: "AsyncSession",
    processes: list[Process],
    *,
    current_user: User,
    total: int,
    offset: int,
    limit: int,
) -> ProcessListResponse:
    blocks = await load_process_derived_blocks(db, processes)
    return ProcessListResponse(
        items=[
            serialize_process_detail(process, current_user=current_user, derived=blocks.get(process.id))
            for process in processes
        ],
        total=total,
        offset=offset,
        limit=limit,
        capabilities=build_process_collection_capabilities(current_user),
    )
