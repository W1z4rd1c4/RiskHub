from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.permissions import (
    can_read_vendor,
    is_vendor_owner,
    get_user_department_ids,
    has_permission,
    can_access_department_id,
    redact_name_if_no_access,
)
from app.core.security import require_permission, check_permission
from app.db.session import get_db
from app.models import Department, Risk, User, Vendor
from app.models.vendor_relationship import VendorRelationship, VendorRelationshipType
from app.models.vendor_service import VendorService, VendorDependency
from app.schemas.vendor_dependency import (
    VendorDependenciesResponse,
    VendorRelationshipRead,
    VendorRelationshipCreate,
    VendorServiceRead,
    VendorServiceCreate,
    VendorServiceUpdate,
    VendorDependencyRead,
    VendorDependencyCreate,
    VendorDependencyGraphNode,
    VendorConcentrationSummary,
    VendorConcentrationFlag,
)
from app.services.vendor_concentration_service import VendorConcentrationService

router = APIRouter()

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
    visited: set[int] = set()

    async def children_for(vendor_id: int, depth: int) -> list[VendorDependencyGraphNode]:
        if depth >= max_depth:
            return []
        if vendor_id in visited:
            return []
        visited.add(vendor_id)

        rels = (
            await db.execute(
                select(VendorRelationship)
                .options(selectinload(VendorRelationship.related_vendor))
                .where(VendorRelationship.vendor_id == vendor_id)
            )
        ).scalars().all()

        nodes: list[VendorDependencyGraphNode] = []
        for rel in rels:
            rv = rel.related_vendor
            if not rv or not can_read_vendor(rv, current_user):
                continue
            nodes.append(
                VendorDependencyGraphNode(
                    vendor_id=rv.id,
                    vendor_name=rv.name,
                    relationship_type=rel.relationship_type.value,
                    children=await children_for(rv.id, depth + 1),
                )
            )
        return nodes

    return VendorDependencyGraphNode(
        vendor_id=root_vendor.id,
        vendor_name=root_vendor.name,
        relationship_type=None,
        children=await children_for(root_vendor.id, 0),
    )


@router.get("/vendors/{vendor_id}/dependencies", response_model=VendorDependenciesResponse)
async def get_vendor_dependencies(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    vendor = await _get_vendor_or_404(db, vendor_id, current_user)

    rels = (
        await db.execute(
            select(VendorRelationship)
            .options(selectinload(VendorRelationship.related_vendor))
            .where(VendorRelationship.vendor_id == vendor_id)
        )
    ).scalars().all()
    rel_reads = [
        VendorRelationshipRead(
            id=r.id,
            vendor_id=r.vendor_id,
            related_vendor_id=r.related_vendor_id,
            related_vendor_name=r.related_vendor.name if r.related_vendor else None,
            relationship_type=r.relationship_type.value,
            created_at=r.created_at,
        )
        for r in rels
        if r.related_vendor and can_read_vendor(r.related_vendor, current_user)
    ]

    services = (
        await db.execute(
            select(VendorService)
            .options(selectinload(VendorService.dependencies).selectinload(VendorDependency.risk), selectinload(VendorService.dependencies).selectinload(VendorDependency.department))
            .where(VendorService.vendor_id == vendor_id)
        )
    ).scalars().all()

    service_reads: list[VendorServiceRead] = []
    for s in services:
        deps_read = [_dependency_read(d, current_user=current_user) for d in s.dependencies]
        service_reads.append(
            VendorServiceRead(
                id=s.id,
                vendor_id=s.vendor_id,
                service_name=s.service_name,
                notes=s.notes,
                dependencies=deps_read,
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
        )

    tree = await _build_relationship_tree(db, root_vendor=vendor, current_user=current_user, max_depth=2)

    concentration = await VendorConcentrationService.compute(db, vendor=vendor)
    concentration_summary = VendorConcentrationSummary(
        score=concentration.score,
        flags=[VendorConcentrationFlag(**f) for f in concentration.flags],
    )

    return VendorDependenciesResponse(
        vendor_id=vendor.id,
        relationships=rel_reads,
        services=service_reads,
        relationship_tree=tree,
        concentration=concentration_summary,
    )


@router.post("/vendors/{vendor_id}/relationships", response_model=VendorRelationshipRead, status_code=status.HTTP_201_CREATED)
async def create_vendor_relationship(
    vendor_id: int,
    payload: VendorRelationshipCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    vendor = await _get_vendor_or_404(db, vendor_id, current_user)
    _require_vendor_write(vendor, current_user)

    if payload.related_vendor_id == vendor_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor cannot relate to itself")

    related = await _get_vendor_or_404(db, payload.related_vendor_id, current_user)
    rel = VendorRelationship(
        vendor_id=vendor_id,
        related_vendor_id=payload.related_vendor_id,
        relationship_type=VendorRelationshipType(payload.relationship_type.value),
    )
    db.add(rel)
    await db.commit()
    await db.refresh(rel)
    return VendorRelationshipRead(
        id=rel.id,
        vendor_id=rel.vendor_id,
        related_vendor_id=rel.related_vendor_id,
        related_vendor_name=related.name,
        relationship_type=rel.relationship_type.value,
        created_at=rel.created_at,
    )


@router.delete("/vendor-relationships/{relationship_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor_relationship(
    relationship_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    rel = (await db.execute(select(VendorRelationship).where(VendorRelationship.id == relationship_id))).scalar_one_or_none()
    if not rel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relationship not found")

    vendor = await _get_vendor_or_404(db, rel.vendor_id, current_user)
    _require_vendor_write(vendor, current_user)
    await db.delete(rel)
    await db.commit()
    return None


@router.post("/vendors/{vendor_id}/services", response_model=VendorServiceRead, status_code=status.HTTP_201_CREATED)
async def create_vendor_service(
    vendor_id: int,
    payload: VendorServiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    vendor = await _get_vendor_or_404(db, vendor_id, current_user)
    _require_vendor_write(vendor, current_user)

    service = VendorService(vendor_id=vendor_id, service_name=payload.service_name, notes=payload.notes)
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return VendorServiceRead(
        id=service.id,
        vendor_id=service.vendor_id,
        service_name=service.service_name,
        notes=service.notes,
        dependencies=[],
        created_at=service.created_at,
        updated_at=service.updated_at,
    )


@router.patch("/vendor-services/{service_id}", response_model=VendorServiceRead)
async def update_vendor_service(
    service_id: int,
    payload: VendorServiceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    service = (await db.execute(select(VendorService).where(VendorService.id == service_id))).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor service not found")
    vendor = await _get_vendor_or_404(db, service.vendor_id, current_user)
    _require_vendor_write(vendor, current_user)

    if payload.service_name is not None:
        service.service_name = payload.service_name
    if payload.notes is not None:
        service.notes = payload.notes

    await db.commit()
    await db.refresh(service)

    # Load dependencies for response
    service = (
        await db.execute(
            select(VendorService)
            .options(selectinload(VendorService.dependencies).selectinload(VendorDependency.risk), selectinload(VendorService.dependencies).selectinload(VendorDependency.department))
            .where(VendorService.id == service_id)
        )
    ).scalar_one()

    deps_read = [_dependency_read(d, current_user=current_user) for d in service.dependencies]

    return VendorServiceRead(
        id=service.id,
        vendor_id=service.vendor_id,
        service_name=service.service_name,
        notes=service.notes,
        dependencies=deps_read,
        created_at=service.created_at,
        updated_at=service.updated_at,
    )


@router.delete("/vendor-services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor_service(
    service_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    service = (await db.execute(select(VendorService).where(VendorService.id == service_id))).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor service not found")
    vendor = await _get_vendor_or_404(db, service.vendor_id, current_user)
    _require_vendor_write(vendor, current_user)
    await db.delete(service)
    await db.commit()
    return None


@router.post("/vendor-services/{service_id}/dependencies", response_model=VendorDependencyRead, status_code=status.HTTP_201_CREATED)
async def create_vendor_dependency(
    service_id: int,
    payload: VendorDependencyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    service = (await db.execute(select(VendorService).where(VendorService.id == service_id))).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor service not found")
    vendor = await _get_vendor_or_404(db, service.vendor_id, current_user)
    _require_vendor_write(vendor, current_user)

    if payload.department_id is not None:
        exists = (await db.execute(select(Department).where(Department.id == payload.department_id))).scalar_one_or_none()
        if not exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    if payload.risk_id is not None:
        if not has_permission(current_user, "risks", "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")
        risk = (await db.execute(select(Risk).where(Risk.id == payload.risk_id))).scalar_one_or_none()
        if not risk:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found")
        # Prevent cross-scope linking: department-scoped users can only link risks in-scope.
        dept_ids = get_user_department_ids(current_user)
        if dept_ids is not None and getattr(risk, "department_id", None) not in dept_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found")

    dep = VendorDependency(
        vendor_service_id=service_id,
        risk_id=payload.risk_id,
        department_id=payload.department_id,
        supported_function_name=payload.supported_function_name,
    )
    db.add(dep)
    await db.commit()
    await db.refresh(dep)

    dep = (
        await db.execute(select(VendorDependency).options(selectinload(VendorDependency.risk), selectinload(VendorDependency.department)).where(VendorDependency.id == dep.id))
    ).scalar_one()

    return _dependency_read(dep, current_user=current_user)


@router.delete("/vendor-dependencies/{dependency_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor_dependency(
    dependency_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    dep = (await db.execute(select(VendorDependency).where(VendorDependency.id == dependency_id))).scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dependency not found")
    service = (await db.execute(select(VendorService).where(VendorService.id == dep.vendor_service_id))).scalar_one()
    vendor = await _get_vendor_or_404(db, service.vendor_id, current_user)
    _require_vendor_write(vendor, current_user)
    await db.delete(dep)
    await db.commit()
    return None
