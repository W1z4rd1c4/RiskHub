from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import can_read_vendor
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.models.vendor_relationship import VendorRelationship
from app.models.vendor_service import VendorDependency, VendorService
from app.schemas.vendor_dependency import (
    VendorConcentrationFlag,
    VendorConcentrationSummary,
    VendorDependenciesResponse,
    VendorRelationshipRead,
    VendorServiceRead,
)
from app.services.vendor_concentration_service import VendorConcentrationService

from ._shared import _build_relationship_tree, _dependency_read, _get_vendor_or_404

router = APIRouter()


@router.get("/vendors/{vendor_id}/dependencies", response_model=VendorDependenciesResponse)
async def get_vendor_dependencies(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    vendor = await _get_vendor_or_404(db, vendor_id, current_user)

    rels = (
        (
            await db.execute(
                select(VendorRelationship)
                .options(selectinload(VendorRelationship.related_vendor))
                .where(VendorRelationship.vendor_id == vendor_id)
            )
        )
        .scalars()
        .all()
    )
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
        (
            await db.execute(
                select(VendorService)
                .options(
                    selectinload(VendorService.dependencies).selectinload(VendorDependency.risk),
                    selectinload(VendorService.dependencies).selectinload(VendorDependency.department),
                )
                .where(VendorService.vendor_id == vendor_id)
            )
        )
        .scalars()
        .all()
    )

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
