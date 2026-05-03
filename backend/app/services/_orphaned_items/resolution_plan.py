from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orphaned_item import OrphanedItem

from .resolution import OrphanResolutionContext, validate_resolution_context


@dataclass(frozen=True)
class OrphanResolutionRequest:
    orphan_id: int
    new_owner_id: int | None = None
    department_id: int | None = None
    target_risk_id: int | None = None


@dataclass(frozen=True)
class OrphanResolutionPlan:
    request: OrphanResolutionRequest
    orphan: OrphanedItem
    item_type: str
    item_id: int
    new_owner_id: int | None
    department_id: int | None
    target_risk_id: int | None
    requirements: dict[str, bool]


def resolution_requirements_for_item_type(item_type: str) -> dict[str, bool]:
    return {
        "requires_owner": item_type in {"risk", "control"},
        "requires_risk": item_type == "kri",
        "requires_department": item_type in {"risk", "control"},
    }


async def build_resolution_plan(
    db: AsyncSession,
    request: OrphanResolutionRequest,
) -> OrphanResolutionPlan:
    context = await validate_resolution_context(
        db,
        orphan_id=request.orphan_id,
        new_owner_id=request.new_owner_id,
        department_id=request.department_id,
        target_risk_id=request.target_risk_id,
    )
    return resolution_plan_from_context(request, context)


def resolution_plan_from_context(
    request: OrphanResolutionRequest,
    context: OrphanResolutionContext,
) -> OrphanResolutionPlan:
    target_risk_id = context.target_risk.id if context.target_risk else None
    return OrphanResolutionPlan(
        request=request,
        orphan=context.orphan,
        item_type=context.orphan.item_type,
        item_id=context.orphan.item_id,
        new_owner_id=request.new_owner_id,
        department_id=context.target_department_id,
        target_risk_id=target_risk_id,
        requirements=resolution_requirements_for_item_type(context.orphan.item_type),
    )
