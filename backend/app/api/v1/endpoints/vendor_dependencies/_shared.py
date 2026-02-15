from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.core.permissions import (
    can_access_department_id,
    can_read_vendor,
    get_user_department_ids,
    has_permission,
    is_vendor_owner,
    redact_name_if_no_access,
)
from app.core.query_filters import vendor_visibility_clause
from app.core.security import check_permission
from app.models import Department, Risk, User, Vendor
from app.models.vendor_relationship import VendorRelationship
from app.models.vendor_service import VendorDependency
from app.schemas.vendor_dependency import VendorDependencyGraphNode, VendorDependencyRead


def _dependency_read(dep: VendorDependency, *, current_user: User) -> VendorDependencyRead:
    dept_name = None
    if dep.department:
        dept_allowed = has_permission(current_user, "departments", "read") and can_access_department_id(
            current_user, dep.department_id
        )
        dept_name = redact_name_if_no_access(dep.department.name, dept_allowed)

    risk_name = None
    if dep.risk:
        risk_allowed = has_permission(current_user, "risks", "read") and can_access_department_id(
            current_user, getattr(dep.risk, "department_id", None)
        )
        risk_name = redact_name_if_no_access(dep.risk.name, risk_allowed)

    return VendorDependencyRead(
        id=dep.id,
        vendor_service_id=dep.vendor_service_id,
        risk_id=dep.risk_id,
        risk_name=risk_name,
        department_id=dep.department_id,
        department_name=dept_name,
        supported_function_name=dep.supported_function_name,
        created_at=dep.created_at,
    )


async def _get_vendor_or_404(db: AsyncSession, vendor_id: int, current_user: User) -> Vendor:
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalar_one_or_none()
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


def _require_vendor_write(vendor: Vendor, current_user: User) -> None:
    can_write = check_permission(current_user, "vendors", "write")
    if can_write:
        return
    if is_vendor_owner(vendor, current_user):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")


async def _build_relationship_tree(
    db: AsyncSession,
    *,
    root_vendor: Vendor,
    current_user: User,
    max_depth: int = 2,
) -> VendorDependencyGraphNode:
    root = VendorDependencyGraphNode(
        vendor_id=root_vendor.id,
        vendor_name=root_vendor.name,
        relationship_type=None,
        children=[],
    )

    # Only one node instance per vendor_id is allowed to be "expanded" (children filled).
    # This matches the old recursion behavior that used a global visited set.
    expander_by_vendor_id: dict[int, VendorDependencyGraphNode] = {root_vendor.id: root}

    to_expand: list[tuple[int, VendorDependencyGraphNode]] = [(root_vendor.id, root)]
    related_alias = aliased(Vendor)

    for depth in range(max_depth):
        if not to_expand:
            break

        vendor_ids = [vid for vid, _ in to_expand]
        stmt = (
            select(VendorRelationship)
            .join(related_alias, related_alias.id == VendorRelationship.related_vendor_id)
            .options(selectinload(VendorRelationship.related_vendor))
            .where(VendorRelationship.vendor_id.in_(vendor_ids))
            .where(vendor_visibility_clause(current_user, related_alias))
        )
        rels = (await db.execute(stmt)).scalars().all()

        rels_by_parent: dict[int, list[VendorRelationship]] = {}
        for r in rels:
            rels_by_parent.setdefault(r.vendor_id, []).append(r)

        next_expand: list[tuple[int, VendorDependencyGraphNode]] = []
        for parent_vendor_id, parent_node in to_expand:
            for rel in rels_by_parent.get(parent_vendor_id, []):
                rv = rel.related_vendor
                if not rv:
                    continue

                child_node = VendorDependencyGraphNode(
                    vendor_id=rv.id,
                    vendor_name=rv.name,
                    relationship_type=rel.relationship_type.value,
                    children=[],
                )
                parent_node.children.append(child_node)

                # Decide if this specific node instance becomes the expander for rv.id.
                if depth + 1 < max_depth and rv.id not in expander_by_vendor_id:
                    expander_by_vendor_id[rv.id] = child_node
                    next_expand.append((rv.id, child_node))

        to_expand = next_expand

    return root


async def _assert_department_exists(db: AsyncSession, *, department_id: int) -> Department:
    exists = (await db.execute(select(Department).where(Department.id == department_id))).scalar_one_or_none()
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    return exists


async def _assert_risk_in_scope(
    db: AsyncSession,
    *,
    risk_id: int,
    current_user: User,
) -> Risk:
    if not has_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")
    risk = (await db.execute(select(Risk).where(Risk.id == risk_id))).scalar_one_or_none()
    if not risk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found")
    # Prevent cross-scope linking: department-scoped users can only link risks in-scope.
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None and getattr(risk, "department_id", None) not in dept_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found")
    return risk

