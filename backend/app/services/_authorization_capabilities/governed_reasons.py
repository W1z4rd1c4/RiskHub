"""Advisory reason facts; these never grant permission to mutate a record."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Asset
from app.services._governed_mutations.asset_impact import asset_impact_is_protected, impact_from_derived
from app.services._governed_mutations.fixed_asset_policy import load_fixed_asset_scenario
from app.services._ict_register_lifecycle.derivation import derive_ict_register
from app.services._ict_register_lifecycle.derivation_inputs import load_ict_register_graph
from app.services._ict_register_reference.parameters import load_ict_workbook_parameter_set


def protected_change_requires_reason(*, scenario_enabled: bool, currently_protected: bool) -> bool:
    """Same current-record meaning for Process, Asset and Vendor read models."""
    return bool(scenario_enabled and currently_protected)


async def asset_reason_requirements(db: AsyncSession, assets: list[Asset]) -> dict[int, bool]:
    """Project only the boolean from the canonical graph, never hidden context.

    Viewer-filtered Asset derivation is intentionally unsuitable for this fact:
    mutation intake still protects an Asset supported by an unreadable Process.
    The bounded batch performs no locks, mutations, or per-row database loads.
    """
    if not assets:
        return {}
    scenario = await load_fixed_asset_scenario(db)
    if scenario is None or not scenario.requires_approval:
        return {asset.id: False for asset in assets}
    parameters = await load_ict_workbook_parameter_set(db)
    graph = await load_ict_register_graph(db, assets=assets)
    derived = derive_ict_register(graph, parameters)
    return {
        asset.id: protected_change_requires_reason(
            scenario_enabled=True,
            currently_protected=asset_impact_is_protected(impact_from_derived(derived.assets[asset.id])),
        )
        for asset in assets
    }
