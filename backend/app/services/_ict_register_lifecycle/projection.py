from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.core.permissions import visible_vendor_ids
from app.core.security import check_permission
from app.models import OrphanedItem, Process, ProcessVendorLink, User
from app.schemas.process import (
    ProcessDepartmentRead,
    ProcessDerived,
    ProcessListCapabilities,
    ProcessListResponse,
    ProcessOwnerRead,
    ProcessRead,
)
from app.services._authorization_capabilities import process_capabilities
from app.services._ict_register_reference.parameters import load_ict_workbook_parameter_set

from .derivation import (
    ANO,
    BCM_GAP,
    CHECK_OK,
    CRITICALITY_CLASSES,
    NE,
    RTO_MTPD_GAP,
    derive_ict_register,
)
from .derivation_inputs import load_ict_register_graph

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


_PROCESS_CRITICALITY_CODE_BY_ENGINE_VALUE = dict(
    zip(CRITICALITY_CLASSES, ("low", "medium", "high", "critical"), strict=True)
)
_PROCESS_CIF_CODE_BY_ENGINE_VALUE = {ANO: "yes", NE: "no"}
_PROCESS_RTO_MTPD_CHECK_CODE_BY_ENGINE_VALUE = {
    CHECK_OK: "ok",
    RTO_MTPD_GAP: "rto_exceeds_mtpd",
}
_PROCESS_BCM_CHECK_CODE_BY_ENGINE_VALUE = {
    CHECK_OK: "ok",
    BCM_GAP: "cif_without_bcm",
}


def _required_engine_code(mapping: dict[str, str], value: str, *, field: str) -> str:
    """Translate one closed engine value to its Process API code, failing closed."""
    try:
        return mapping[value]
    except KeyError as exc:
        raise ValueError(f"Unsupported engine Process {field} value: {value!r}") from exc


def _optional_engine_code(
    mapping: dict[str, str],
    value: str | None,
    *,
    field: str,
) -> str | None:
    if value is None:
        return None
    return _required_engine_code(mapping, value, field=field)


def _canonical_process_derived_block(engine_block: object) -> ProcessDerived:
    """Project workbook-native engine values into the canonical Process API."""
    block = ProcessDerived.model_validate(engine_block)
    transitive_links = [
        link.model_copy(
            update={
                "process_cif": _optional_engine_code(
                    _PROCESS_CIF_CODE_BY_ENGINE_VALUE,
                    link.process_cif,
                    field="transitive process_cif",
                ),
                "process_criticality": _optional_engine_code(
                    _PROCESS_CRITICALITY_CODE_BY_ENGINE_VALUE,
                    link.process_criticality,
                    field="transitive process_criticality",
                ),
            }
        )
        for link in block.transitive_vendor_links
    ]
    return block.model_copy(
        update={
            "criticality_class": _optional_engine_code(
                _PROCESS_CRITICALITY_CODE_BY_ENGINE_VALUE,
                block.criticality_class,
                field="criticality_class",
            ),
            "cif": _required_engine_code(
                _PROCESS_CIF_CODE_BY_ENGINE_VALUE,
                block.cif,
                field="cif",
            ),
            "rto_mtpd_check": _optional_engine_code(
                _PROCESS_RTO_MTPD_CHECK_CODE_BY_ENGINE_VALUE,
                block.rto_mtpd_check,
                field="rto_mtpd_check",
            ),
            "bcm_check": _required_engine_code(
                _PROCESS_BCM_CHECK_CODE_BY_ENGINE_VALUE,
                block.bcm_check,
                field="bcm_check",
            ),
            "transitive_vendor_links": transitive_links,
        }
    )


async def load_process_derived_blocks(
    db: "AsyncSession", processes: list[Process], *, current_user: User
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
    blocks = {
        process.id: _canonical_process_derived_block(derivation.processes[process.id])
        for process in processes
    }
    return await _filter_linked_context(
        db,
        current_user=current_user,
        blocks=blocks,
    )


async def _filter_linked_context(
    db: "AsyncSession",
    *,
    current_user: User,
    blocks: dict[int, ProcessDerived],
) -> dict[int, ProcessDerived]:
    """Keep only linked-register context the caller can independently read.

    Process assignment grants record-specific Process access, not Asset or
    Vendor access. The derivation engine intentionally computes over the full
    register graph, so its result must be reduced at the API projection
    boundary before names, identifiers, or even relationship counts are
    returned to a scoped caller.
    """
    if not blocks:
        return blocks

    can_read_assets = check_permission(current_user, "assets", "read")
    can_read_vendors = check_permission(current_user, "vendors", "read")

    manual_vendor_ids: dict[int, list[int]] = defaultdict(list)
    candidate_vendor_ids = {
        link.vendor_id
        for block in blocks.values()
        for link in block.transitive_vendor_links
    }
    if can_read_vendors:
        rows = await db.execute(
            select(ProcessVendorLink.process_id, ProcessVendorLink.vendor_id).where(
                ProcessVendorLink.process_id.in_(blocks)
            )
        )
        for process_id, vendor_id in rows.all():
            manual_vendor_ids[process_id].append(vendor_id)
            candidate_vendor_ids.add(vendor_id)

    readable_vendor_ids = (
        await visible_vendor_ids(db, current_user, candidate_vendor_ids)
        if can_read_vendors
        else set()
    )

    filtered: dict[int, ProcessDerived] = {}
    for process_id, block in blocks.items():
        visible_transitive_links = [
            link
            for link in block.transitive_vendor_links
            if can_read_assets and link.vendor_id in readable_vendor_ids
        ]
        visible_manual_vendor_count = sum(
            vendor_id in readable_vendor_ids
            for vendor_id in manual_vendor_ids.get(process_id, [])
        )
        visible_transitive_vendor_count = len(visible_transitive_links)
        filtered_inputs = block.inputs.model_copy(
            update={
                "manual_vendor_link_count": visible_manual_vendor_count,
                "transitive_vendor_pair_count": visible_transitive_vendor_count,
            }
        )
        filtered[process_id] = block.model_copy(
            update={
                "linked_asset_count": block.linked_asset_count if can_read_assets else 0,
                "linked_vendor_count": (
                    visible_manual_vendor_count + visible_transitive_vendor_count
                ),
                "inputs": filtered_inputs,
                "transitive_vendor_links": visible_transitive_links,
            }
        )
    return filtered


def serialize_process_detail(
    process: Process,
    *,
    current_user: User,
    derived: ProcessDerived | None = None,
    ownership_pending: bool = False,
) -> ProcessRead:
    owner = process.process_owner
    department = process.owning_department
    owner_projection = None
    if owner is not None:
        owner_projection = ProcessOwnerRead(
            name=owner.name,
            email=owner.email,
            role_name=owner.role.name,
            department_name=owner.department.name if owner.department is not None else None,
        )
    department_projection = None
    if department is not None:
        department_projection = ProcessDepartmentRead(name=department.name, code=department.code)

    owner_is_valid = bool(owner is not None and owner.is_active)
    department_is_valid = bool(department is not None and department.is_active)
    if ownership_pending:
        ownership_status = "pending_governance"
    elif owner is None or department is None:
        ownership_status = "legacy_unassigned"
    elif owner_is_valid and department_is_valid:
        ownership_status = "assigned"
    else:
        ownership_status = "invalid_assignment"

    base = ProcessRead.model_validate(
        {column.name: getattr(process, column.name) for column in Process.__table__.columns}
    )
    return base.model_copy(
        update={
            "process_owner": owner_projection,
            "owning_department": department_projection,
            "owner_orphaned": ownership_pending,
            "ownership_status": ownership_status,
            "capabilities": process_capabilities(
                current_user,
                process,
                ownership_pending=ownership_pending,
            ),
            "derived": derived,
        }
    )


async def pending_process_ownership_orphan_ids(
    db: "AsyncSession",
    *,
    process_ids: list[int],
) -> set[int]:
    if not process_ids:
        return set()
    return set(
        (
            await db.execute(
                select(OrphanedItem.item_id).where(
                    OrphanedItem.item_type == "process",
                    OrphanedItem.item_id.in_(process_ids),
                    OrphanedItem.status == "pending",
                )
            )
        )
        .scalars()
        .all()
    )


async def serialize_process_detail_with_derived(
    db: "AsyncSession",
    process: Process,
    *,
    current_user: User,
) -> ProcessRead:
    blocks = await load_process_derived_blocks(db, [process], current_user=current_user)
    pending_ids = await pending_process_ownership_orphan_ids(db, process_ids=[process.id])
    return serialize_process_detail(
        process,
        current_user=current_user,
        derived=blocks[process.id],
        ownership_pending=process.id in pending_ids,
    )


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
    blocks = await load_process_derived_blocks(db, processes, current_user=current_user)
    pending_ids = await pending_process_ownership_orphan_ids(
        db,
        process_ids=[process.id for process in processes],
    )
    return ProcessListResponse(
        items=[
            serialize_process_detail(
                process,
                current_user=current_user,
                derived=blocks.get(process.id),
                ownership_pending=process.id in pending_ids,
            )
            for process in processes
        ],
        total=total,
        offset=offset,
        limit=limit,
        capabilities=build_process_collection_capabilities(current_user),
    )
