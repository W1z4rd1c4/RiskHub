from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.asset import Asset
from app.models.control import Control
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.orphaned_item import OrphanedItem
from app.models.process import Process
from app.models.risk import Risk
from app.models.threat import Threat
from app.models.vendor import Vendor
from app.services._governed_mutations.asset_impact import (
    asset_impact_is_protected,
)
from app.services._governed_mutations.asset_impact import (
    impact_from_derived as asset_impact_from_derived,
)
from app.services._governed_mutations.fixed_accountability_policy import (
    load_fixed_accountability_scenario,
)
from app.services._governed_mutations.fixed_asset_policy import (
    load_fixed_asset_scenario,
)
from app.services._governed_mutations.fixed_policy import (
    load_fixed_process_scenario,
)
from app.services._governed_mutations.fixed_vendor_policy import (
    load_fixed_vendor_scenario,
)
from app.services._governed_mutations.vendor_impact import (
    impact_from_derived as vendor_impact_from_derived,
)
from app.services._governed_mutations.vendor_impact import (
    vendor_impact_is_protected,
)
from app.services._ict_register_lifecycle.derivation import (
    ANO,
    derive_ict_register,
)
from app.services._ict_register_lifecycle.derivation_inputs import (
    load_ict_register_graph,
)
from app.services._ict_register_reference.parameters import (
    load_ict_workbook_parameter_set,
)


@dataclass(frozen=True)
class OrphanItemDefinition:
    item_type: str
    unknown_label: str
    requires_owner: bool
    requires_risk: bool
    requires_department: bool


@dataclass(frozen=True)
class OrphanDetectionPlan:
    item_type: str
    item_id: int
    previous_owner_id: int
    reason: str
    dedupe_status: str = "pending"


@dataclass(frozen=True)
class OrphanResolutionRequirements:
    item_type: str
    requires_owner: bool
    requires_risk: bool
    requires_department: bool


@dataclass(frozen=True)
class OrphanDisplayProjection:
    item_name: str
    item_description: str | None
    item_identifier: str | None
    department_name: str | None


ORPHAN_ITEM_DEFINITIONS: dict[str, OrphanItemDefinition] = {
    "risk": OrphanItemDefinition(
        item_type="risk",
        unknown_label="Unknown risk",
        requires_owner=True,
        requires_risk=False,
        requires_department=True,
    ),
    "control": OrphanItemDefinition(
        item_type="control",
        unknown_label="Unknown control",
        requires_owner=True,
        requires_risk=False,
        requires_department=True,
    ),
    "kri": OrphanItemDefinition(
        item_type="kri",
        unknown_label="Unknown KRI",
        requires_owner=False,
        requires_risk=True,
        requires_department=False,
    ),
    "threat": OrphanItemDefinition(
        item_type="threat",
        unknown_label="Unknown threat",
        requires_owner=True,
        requires_risk=False,
        requires_department=False,
    ),
    "process": OrphanItemDefinition(
        item_type="process",
        unknown_label="Unknown process",
        requires_owner=True,
        requires_risk=False,
        requires_department=True,
    ),
    "asset": OrphanItemDefinition(
        item_type="asset",
        unknown_label="Unknown asset",
        requires_owner=True,
        requires_risk=False,
        requires_department=True,
    ),
    "vendor": OrphanItemDefinition(
        item_type="vendor",
        unknown_label="Unknown vendor",
        requires_owner=True,
        requires_risk=False,
        requires_department=False,
    ),
}


# Item types whose repair is an accountability reassignment — the same four
# types project_orphan_request_reason_requirements below can govern; resolving
# them must go through the governed reassignment workflow.
GOVERNED_ACCOUNTABILITY_ITEM_TYPES = frozenset({"asset", "process", "threat", "vendor"})


def orphan_item_definition(item_type: str) -> OrphanItemDefinition:
    try:
        return ORPHAN_ITEM_DEFINITIONS[item_type]
    except KeyError as exc:
        raise ValueError(f"Unsupported orphaned item type: {item_type}") from exc


def orphan_resolution_requirements_projection(item_type: str) -> OrphanResolutionRequirements:
    definition = orphan_item_definition(item_type)
    return OrphanResolutionRequirements(
        item_type=definition.item_type,
        requires_owner=definition.requires_owner,
        requires_risk=definition.requires_risk,
        requires_department=definition.requires_department,
    )


def orphan_resolution_requirements(item_type: str) -> dict[str, bool]:
    plan = orphan_resolution_requirements_projection(item_type)
    return {
        "requires_owner": plan.requires_owner,
        "requires_risk": plan.requires_risk,
        "requires_department": plan.requires_department,
    }


def orphan_capability_flags(item_type: str, *, is_pending: bool) -> dict[str, bool]:
    definition = orphan_item_definition(item_type)
    return {
        "can_resolve": is_pending,
        "can_view_detail": True,
        "requires_owner": definition.requires_owner,
        "requires_risk": definition.requires_risk,
        "requires_department": definition.requires_department,
    }


async def project_orphan_request_reason_requirements(
    db: AsyncSession,
    orphans: list[OrphanedItem],
) -> dict[int, bool]:
    """Project the live reason requirement without resource-domain authority."""
    pending = [orphan for orphan in orphans if orphan.status == "pending"]
    requirements = {orphan.id: False for orphan in orphans}
    if not pending:
        return requirements

    accountability, process_scenario, asset_scenario, vendor_scenario = (
        await load_fixed_accountability_scenario(db),
        await load_fixed_process_scenario(db),
        await load_fixed_asset_scenario(db),
        await load_fixed_vendor_scenario(db),
    )
    accountability_enabled = bool(
        accountability is not None and accountability.requires_approval
    )
    process_policy_enabled = bool(
        process_scenario is not None and process_scenario.requires_approval
    )
    asset_policy_enabled = bool(
        asset_scenario is not None and asset_scenario.requires_approval
    )
    vendor_policy_enabled = bool(
        vendor_scenario is not None and vendor_scenario.requires_approval
    )

    process_ids = {
        orphan.item_id for orphan in pending if orphan.item_type == "process"
    }
    asset_ids = {
        orphan.item_id for orphan in pending if orphan.item_type == "asset"
    }
    vendor_ids = {
        orphan.item_id for orphan in pending if orphan.item_type == "vendor"
    }
    threat_ids = {
        orphan.item_id for orphan in pending if orphan.item_type == "threat"
    }

    processes = list(
        (
            await db.execute(select(Process).where(Process.id.in_(process_ids)))
        ).scalars()
    )
    assets = list(
        (await db.execute(select(Asset).where(Asset.id.in_(asset_ids)))).scalars()
    )
    vendors = list(
        (await db.execute(select(Vendor).where(Vendor.id.in_(vendor_ids)))).scalars()
    )
    process_by_id = {process.id: process for process in processes}
    asset_by_id = {asset.id: asset for asset in assets}
    vendor_by_id = {vendor.id: vendor for vendor in vendors}
    existing_threat_ids = set(
        (
            await db.execute(select(Threat.id).where(Threat.id.in_(threat_ids)))
        ).scalars()
    )

    process_asset_ids: dict[int, set[int]] = {}
    process_vendor_ids: dict[int, set[int]] = {}
    asset_vendor_ids: dict[int, set[int]] = {}
    derivation = None
    if processes or assets or vendors:
        graph = await load_ict_register_graph(
            db,
            processes=processes,
            assets=assets,
            vendors=vendors,
        )
        for process_asset_link in graph.process_asset_links:
            if process_asset_link.process_id in process_ids:
                process_asset_ids.setdefault(process_asset_link.process_id, set()).add(process_asset_link.asset_id)
        asset_scope_ids = asset_ids | {
            asset_id
            for linked_asset_ids in process_asset_ids.values()
            for asset_id in linked_asset_ids
        }
        for asset_vendor_link in graph.asset_vendor_links:
            if asset_vendor_link.asset_id in asset_scope_ids:
                asset_vendor_ids.setdefault(asset_vendor_link.asset_id, set()).add(asset_vendor_link.vendor_id)
        for process_vendor_link in graph.process_vendor_links:
            if process_vendor_link.process_id in process_ids:
                process_vendor_ids.setdefault(process_vendor_link.process_id, set()).add(process_vendor_link.vendor_id)
        for process_id, linked_asset_ids in process_asset_ids.items():
            process_vendor_ids.setdefault(process_id, set()).update(
                vendor_id
                for asset_id in linked_asset_ids
                for vendor_id in asset_vendor_ids.get(asset_id, ())
            )
        downstream_vendor_ids = {
            vendor_id
            for linked_vendor_ids in process_vendor_ids.values()
            for vendor_id in linked_vendor_ids
        } | {
            vendor_id
            for target_asset_id in asset_ids
            for vendor_id in asset_vendor_ids.get(target_asset_id, ())
        }
        missing_vendors = downstream_vendor_ids - {vendor.id for vendor in vendors}
        if missing_vendors:
            vendors.extend(
                (
                    await db.execute(
                        select(Vendor).where(Vendor.id.in_(missing_vendors))
                    )
                ).scalars()
            )
            graph = await load_ict_register_graph(
                db,
                processes=processes,
                assets=assets,
                vendors=vendors,
            )
        derivation = derive_ict_register(
            graph,
            await load_ict_workbook_parameter_set(db),
        )

    def protected_asset(asset_id: int) -> bool:
        return bool(
            derivation is not None
            and asset_id in derivation.assets
            and asset_impact_is_protected(
                asset_impact_from_derived(derivation.assets[asset_id])
            )
        )

    def protected_vendor(vendor_id: int) -> bool:
        return bool(
            derivation is not None
            and vendor_id in derivation.vendors
            and vendor_impact_is_protected(
                vendor_impact_from_derived(derivation.vendors[vendor_id])
            )
        )

    for orphan in pending:
        if orphan.item_type == "process" and orphan.item_id in process_by_id:
            requirements[orphan.id] = bool(
                accountability_enabled
                or (
                    process_policy_enabled
                    and derivation is not None
                    and derivation.processes[orphan.item_id].cif == ANO
                )
                or (
                    asset_policy_enabled
                    and any(
                        protected_asset(asset_id)
                        for asset_id in process_asset_ids.get(orphan.item_id, ())
                    )
                )
                or (
                    vendor_policy_enabled
                    and any(
                        protected_vendor(vendor_id)
                        for vendor_id in process_vendor_ids.get(orphan.item_id, ())
                    )
                )
            )
        elif orphan.item_type == "asset" and orphan.item_id in asset_by_id:
            requirements[orphan.id] = bool(
                accountability_enabled
                or (
                    asset_policy_enabled
                    and protected_asset(orphan.item_id)
                )
                or (
                    vendor_policy_enabled
                    and any(
                        protected_vendor(vendor_id)
                        for vendor_id in asset_vendor_ids.get(orphan.item_id, ())
                    )
                )
            )
        elif orphan.item_type == "vendor" and orphan.item_id in vendor_by_id:
            requirements[orphan.id] = bool(
                accountability_enabled
                or (
                    vendor_policy_enabled
                    and protected_vendor(orphan.item_id)
                )
            )
        elif orphan.item_type == "threat":
            requirements[orphan.id] = bool(
                accountability_enabled and orphan.item_id in existing_threat_ids
            )
    return requirements


async def load_orphan_display_projection(
    db: AsyncSession,
    item_type: str,
    item_id: int,
) -> OrphanDisplayProjection:
    definition = orphan_item_definition(item_type)
    if item_type == "risk":
        risk_result = await db.execute(select(Risk).options(selectinload(Risk.department)).where(Risk.id == item_id))
        risk = risk_result.scalar_one_or_none()
        if risk is None:
            return _unknown_projection(definition)
        return OrphanDisplayProjection(
            item_name=risk.name or definition.unknown_label,
            item_description=risk.description,
            item_identifier=risk.risk_id_code,
            department_name=risk.department.name if risk.department else None,
        )

    if item_type == "control":
        control_result = await db.execute(
            select(Control).options(selectinload(Control.department)).where(Control.id == item_id)
        )
        control = control_result.scalar_one_or_none()
        if control is None:
            return _unknown_projection(definition)
        return OrphanDisplayProjection(
            item_name=control.name or definition.unknown_label,
            item_description=control.description,
            item_identifier=None,
            department_name=control.department.name if control.department else None,
        )

    if item_type == "threat":
        threat = (await db.execute(select(Threat).where(Threat.id == item_id))).scalar_one_or_none()
        if threat is None:
            return _unknown_projection(definition)
        return OrphanDisplayProjection(
            item_name=threat.name or definition.unknown_label,
            item_description=threat.description,
            item_identifier=None,
            department_name=None,
        )

    if item_type == "process":
        process = (
            await db.execute(
                select(Process)
                .options(selectinload(Process.owning_department))
                .where(Process.id == item_id)
            )
        ).scalar_one_or_none()
        if process is None:
            return _unknown_projection(definition)
        return OrphanDisplayProjection(
            item_name=process.l1_process or definition.unknown_label,
            item_description=process.notes,
            item_identifier=process.f_code,
            department_name=(
                process.owning_department.name
                if process.owning_department is not None
                else None
            ),
        )

    if item_type == "asset":
        asset = (
            await db.execute(
                select(Asset)
                .options(selectinload(Asset.owning_department))
                .where(Asset.id == item_id)
            )
        ).scalar_one_or_none()
        if asset is None:
            return _unknown_projection(definition)
        return OrphanDisplayProjection(
            item_name=asset.name or definition.unknown_label,
            item_description=asset.description,
            item_identifier=None,
            department_name=(
                asset.owning_department.name
                if asset.owning_department is not None
                else None
            ),
        )

    if item_type == "vendor":
        vendor = (
            await db.execute(
                select(Vendor)
                .options(selectinload(Vendor.department))
                .where(Vendor.id == item_id)
            )
        ).scalar_one_or_none()
        if vendor is None:
            return _unknown_projection(definition)
        return OrphanDisplayProjection(
            item_name=vendor.name or definition.unknown_label,
            item_description=vendor.description,
            item_identifier=vendor.registration_id,
            department_name=(
                vendor.department.name if vendor.department is not None else None
            ),
        )

    kri_result = await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.id == item_id))
    kri = kri_result.scalar_one_or_none()
    if kri is None:
        return _unknown_projection(definition)
    risk_result = await db.execute(select(Risk).options(selectinload(Risk.department)).where(Risk.id == kri.risk_id))
    risk = risk_result.scalar_one_or_none()
    return OrphanDisplayProjection(
        item_name=kri.metric_name or definition.unknown_label,
        item_description=kri.description,
        item_identifier=None,
        department_name=risk.department.name if risk and risk.department else None,
    )


def _unknown_projection(definition: OrphanItemDefinition) -> OrphanDisplayProjection:
    return OrphanDisplayProjection(
        item_name=definition.unknown_label,
        item_description=None,
        item_identifier=None,
        department_name=None,
    )
