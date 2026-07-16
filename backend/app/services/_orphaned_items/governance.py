from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.asset import Asset
from app.models.control import Control
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.process import Process
from app.models.risk import Risk
from app.models.threat import Threat
from app.models.vendor import Vendor


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
