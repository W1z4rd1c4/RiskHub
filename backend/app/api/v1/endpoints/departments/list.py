from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import and_, or_, select

from app.core.security import require_permission
from app.db.session import get_db
from app.models import Department, User
from app.schemas.department import DepartmentSummary

from ._shared import (
    _count_active_users_by_dept,
    _count_breaching_kris_by_dept,
    _count_controls_by_dept,
    _count_high_risks_by_dept,
    _count_kris_by_dept,
    _count_risks_by_dept,
    _get_scoped_department_ids,
    _sum_net_scores_by_dept,
)

router = APIRouter()


@router.get("", response_model=list[DepartmentSummary])
async def list_departments(
    db=Depends(get_db),
    current_user: User = Depends(require_permission("departments", "read")),
):
    """
    List all departments with summary statistics.

    Scoping: Non-privileged users see only their own department(s).
    Excludes: Inactive departments; archived entities in counts.
    """
    # 1. Load visible departments
    active_dept_ids = (
        select(User.department_id).where(and_(User.department_id.isnot(None), User.is_active.is_(True))).distinct()
    )

    query = (
        select(Department)
        .where(or_(Department.is_system.is_(True), Department.id.in_(active_dept_ids)))
        .where(Department.is_active.is_(True))
        .order_by(Department.name)
    )
    dept_ids = _get_scoped_department_ids(current_user)
    if dept_ids is not None:
        query = query.filter(Department.id.in_(dept_ids))

    result = await db.execute(query)
    departments = result.scalars().all()

    # 2. Compute count maps (each helper returns dict[department_id, count])
    user_counts = await _count_active_users_by_dept(db)
    risk_counts = await _count_risks_by_dept(db)
    high_risk_counts = await _count_high_risks_by_dept(db)
    control_counts = await _count_controls_by_dept(db)
    kri_counts = await _count_kris_by_dept(db)
    breaching_kri_counts = await _count_breaching_kris_by_dept(db)
    net_score_totals = await _sum_net_scores_by_dept(db)

    # 3. Build response objects
    return [
        DepartmentSummary(
            id=dept.id,
            name=dept.name,
            code=dept.code,
            user_count=user_counts.get(dept.id, 0),
            risk_count=risk_counts.get(dept.id, 0),
            control_count=control_counts.get(dept.id, 0),
            high_risk_count=high_risk_counts.get(dept.id, 0),
            breaching_kri_count=breaching_kri_counts.get(dept.id, 0),
            kri_count=kri_counts.get(dept.id, 0),
            total_net_score=int(net_score_totals.get(dept.id, 0)),
        )
        for dept in departments
    ]
