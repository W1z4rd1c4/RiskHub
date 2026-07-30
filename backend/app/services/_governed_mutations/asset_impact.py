"""Pure-graph Asset impact derivation and deterministic downstream locking."""

from __future__ import annotations

from dataclasses import replace

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models import Asset, GovernedMutationImpactLock, Process, ProcessAssetLink
from app.services._ict_register_lifecycle.derivation import (
    ProcessAssetLinkInput,
    derive_ict_register,
)
from app.services._ict_register_lifecycle.derivation_inputs import (
    load_ict_register_graph,
    process_derivation_input,
)
from app.services._ict_register_reference.parameters import (
    load_ict_workbook_parameter_set_for_update,
)


def impact_from_derived(derived) -> dict[str, object]:
    return {
        "cif": "yes" if derived.cif == "Ano" else "no",
        "resulting_criticality": {
            "Nízká": "low",
            "Střední": "medium",
            "Vysoká": "high",
            "Kritická": "critical",
        }.get(derived.resulting_criticality, derived.resulting_criticality),
    }


def asset_impact_is_protected(impact: dict[str, object]) -> bool:
    return bool(
        impact.get("cif") == "yes"
        or impact.get("resulting_criticality") == "critical"
    )


async def process_point_asset_impacts(
    db: AsyncSession,
    *,
    process: Process,
    updates: dict[str, object],
    archive: bool = False,
    assets: list[Asset] | None = None,
    parameters=None,
) -> tuple[list[Asset], list[dict[str, object]]]:
    """Lock and rederive every Asset directly downstream of a Process point mutation."""
    if assets is None:
        assets = list(
            (
                await db.execute(
                    select(Asset)
                    .join(ProcessAssetLink, ProcessAssetLink.asset_id == Asset.id)
                    .where(ProcessAssetLink.process_id == process.id)
                    .order_by(Asset.id)
                    .with_for_update()
                )
            ).scalars()
        )
    if not assets:
        return [], []
    if parameters is None:
        parameters = await load_ict_workbook_parameter_set_for_update(db)
    graph = await load_ict_register_graph(db, processes=[process], assets=assets)
    before_derivation = derive_ict_register(graph, parameters)
    proposed_process = process_derivation_input(process)
    if not archive:
        supported = set(proposed_process.__dataclass_fields__)
        proposed_process = replace(
            proposed_process,
            **{field: value for field, value in updates.items() if field in supported},
        )
    proposed_graph = replace(
        graph,
        processes=(
            tuple(row for row in graph.processes if row.id != process.id)
            if archive
            else tuple(proposed_process if row.id == process.id else row for row in graph.processes)
        ),
        process_asset_links=(
            tuple(link for link in graph.process_asset_links if link.process_id != process.id)
            if archive
            else graph.process_asset_links
        ),
    )
    after_derivation = derive_ict_register(proposed_graph, parameters)
    rows = [
        {
            "resource_id": asset.id,
            "before": impact_from_derived(before_derivation.assets[asset.id]),
            "after": impact_from_derived(after_derivation.assets[asset.id]),
        }
        for asset in assets
    ]
    return assets, rows


async def process_asset_composite_impact(
    db: AsyncSession,
    *,
    operation: dict[str, object],
    proposal_db_id: int | None = None,
    asset: Asset | None = None,
    parameters=None,
) -> tuple[Asset, dict[str, object], bool]:
    """Rederive one Process-to-Asset operation at the pure graph seam."""
    asset_id = int(operation["related_resource_id"])
    process_id = int(operation["process_id"])
    process = (await db.execute(select(Process).where(Process.id == process_id).with_for_update())).scalar_one_or_none()
    if process is None:
        raise NotFoundError("Process not found")
    if asset is None:
        asset = (await db.execute(select(Asset).where(Asset.id == asset_id).with_for_update())).scalar_one_or_none()
    elif asset.id != asset_id:
        raise ValidationError("Governed Process-to-Asset identity is stale")
    if asset is None:
        raise NotFoundError("Asset not found")
    pending_statement = select(GovernedMutationImpactLock.id).where(
        GovernedMutationImpactLock.resource_type == "asset",
        GovernedMutationImpactLock.resource_id == asset.id,
        GovernedMutationImpactLock.released_at.is_(None),
    )
    if proposal_db_id is not None:
        pending_statement = pending_statement.where(GovernedMutationImpactLock.proposal_id != proposal_db_id)
    if await db.scalar(pending_statement.limit(1)) is not None:
        raise ConflictError("A governed Asset change is already pending", code="asset_pending_mutation")
    if parameters is None:
        parameters = await load_ict_workbook_parameter_set_for_update(db)
    graph = await load_ict_register_graph(db, processes=[process], assets=[asset])
    before = derive_ict_register(graph, parameters).assets[asset.id]
    action = operation.get("action")
    after_values = operation.get("after") if isinstance(operation.get("after"), dict) else {}
    if action == "add":
        links = (
            *graph.process_asset_links,
            ProcessAssetLinkInput(
                process_id=process_id,
                asset_id=asset.id,
                significance=after_values.get("significance"),
                spof=after_values.get("spof"),
                is_primary=bool(after_values.get("is_primary", False)),
            ),
        )
    elif action == "remove":
        links = tuple(
            link
            for link in graph.process_asset_links
            if not (link.process_id == process_id and link.asset_id == asset.id)
        )
    elif action == "update":
        links = tuple(
            ProcessAssetLinkInput(
                process_id=link.process_id,
                asset_id=link.asset_id,
                significance=after_values.get("significance"),
                spof=after_values.get("spof"),
                is_primary=bool(after_values.get("is_primary", False)),
            )
            if link.process_id == process_id and link.asset_id == asset.id
            else link
            for link in graph.process_asset_links
        )
    else:
        raise ValidationError("Unsupported Process-to-Asset relationship action")
    after = derive_ict_register(replace(graph, process_asset_links=tuple(links)), parameters).assets[asset.id]
    before_impact = impact_from_derived(before)
    after_impact = impact_from_derived(after)
    protected = any(
        impact["cif"] == "yes" or impact["resulting_criticality"] == "critical"
        for impact in (before_impact, after_impact)
    )
    return asset, {"resource_id": asset.id, "before": before_impact, "after": after_impact}, protected


async def existing_asset_impacts(
    db: AsyncSession, *, asset: Asset, updates: dict[str, object]
) -> tuple[dict[str, object], dict[str, object]]:
    parameters = await load_ict_workbook_parameter_set_for_update(db)
    graph = await load_ict_register_graph(db, assets=[asset])
    current_input = next(item for item in graph.assets if item.id == asset.id)
    derivation_fields = set(current_input.__dataclass_fields__)
    proposed_input = replace(
        current_input,
        **{key: value for key, value in updates.items() if key in derivation_fields},
    )
    current = derive_ict_register(graph, parameters).assets[asset.id]
    proposed_graph = replace(
        graph,
        assets=tuple(proposed_input if item.id == asset.id else item for item in graph.assets),
    )
    proposed = derive_ict_register(proposed_graph, parameters).assets[asset.id]
    return impact_from_derived(current), impact_from_derived(proposed)


__all__ = [
    "asset_impact_is_protected",
    "existing_asset_impacts",
    "impact_from_derived",
    "process_asset_composite_impact",
    "process_point_asset_impacts",
]
