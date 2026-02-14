from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.sql import case

from app.api.mappers.risk import risk_to_summary
from app.core.pagination import DEFAULT_PAGE_SIZE, DEPARTMENT_RECENT_EXECUTIONS_LIMIT, MAX_PAGE_SIZE
from app.core.permissions import check_department_access, get_user_department_ids
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import Control, ControlExecution, Department, KeyRiskIndicator, Risk, User
from app.models.control import ControlStatus
from app.models.global_config import ConfigDefaults, build_risk_level_ranges
from app.models.risk import RiskStatus
from app.schemas.control import (
    ControlFormEnum,
    ControlStatusEnum,
    ControlSummary,
    normalize_control_frequency,
)
from app.schemas.department import (
    ControlStats,
    DepartmentDetail,
    DepartmentSummary,
    RecentExecution,
    RiskDistribution,
)
from app.schemas.kri import KRIResponse
from app.schemas.risk import RiskSummary

router = APIRouter()


# Risk level score ranges (uses ConfigDefaults for consistency)
RISK_LEVEL_RANGES = build_risk_level_ranges(
    ConfigDefaults.MEDIUM_RISK_MIN_NET_SCORE,
    ConfigDefaults.HIGH_RISK_MIN_NET_SCORE,
    ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE,
)


# ---------------------------------------------------------------------------
# Private helpers: scoping and pagination
# ---------------------------------------------------------------------------


def _get_scoped_department_ids(current_user: User) -> Optional[list[int]]:
    """
    Return visible department IDs for the user.

    Returns None if user sees all departments (privileged).
    """
    return get_user_department_ids(current_user)


async def _assert_department_in_scope(
    department_id: int, db: AsyncSession, current_user: User
) -> Department:
    """
    Load department by id and verify user access.

    Raises HTTPException 404 if not found; 403 if out of scope.
    """
    result = await db.execute(select(Department).where(Department.id == department_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    check_department_access(department_id, current_user)
    return dept


def _clamp_pagination(skip: int, limit: int) -> tuple[int, int]:
    """
    Enforce pagination bounds.

    Returns (skip, limit) where limit is clamped to MAX_PAGE_SIZE.
    """
    return max(0, skip), min(limit, MAX_PAGE_SIZE)


# ---------------------------------------------------------------------------
# Private helpers: stats builders (return dict[department_id, count])
# ---------------------------------------------------------------------------


async def _count_active_users_by_dept(db: AsyncSession) -> dict[int, int]:
    """Active user count per department."""
    result = await db.execute(
        select(User.department_id, func.count(User.id))
        .where(User.is_active == True)
        .group_by(User.department_id)
    )
    return dict(result.all())


async def _count_risks_by_dept(db: AsyncSession) -> dict[int, int]:
    """Non-archived risk count per department."""
    result = await db.execute(
        select(Risk.department_id, func.count(Risk.id))
        .where(Risk.status != RiskStatus.archived.value)
        .group_by(Risk.department_id)
    )
    return dict(result.all())


async def _count_high_risks_by_dept(db: AsyncSession) -> dict[int, int]:
    """Non-archived risk count with net_score >= HIGH_RISK_MIN_NET_SCORE per department.
    
    Uses ConfigDefaults.HIGH_RISK_MIN_NET_SCORE (10) for consistency with dashboard.
    """
    result = await db.execute(
        select(Risk.department_id, func.count(Risk.id))
        .where(and_(Risk.status != RiskStatus.archived.value, Risk.net_score >= ConfigDefaults.HIGH_RISK_MIN_NET_SCORE))
        .group_by(Risk.department_id)
    )
    return dict(result.all())


async def _count_controls_by_dept(db: AsyncSession) -> dict[int, int]:
    """Non-archived control count per department."""
    result = await db.execute(
        select(Control.department_id, func.count(Control.id))
        .where(Control.status != ControlStatus.archived.value)
        .group_by(Control.department_id)
    )
    return dict(result.all())


async def _count_kris_by_dept(db: AsyncSession) -> dict[int, int]:
    """KRI count linked to non-archived risks, grouped by risk's department."""
    result = await db.execute(
        select(Risk.department_id, func.count(KeyRiskIndicator.id))
        .join(Risk)
        .where(Risk.status != RiskStatus.archived.value)
        .group_by(Risk.department_id)
    )
    return dict(result.all())


async def _count_breaching_kris_by_dept(db: AsyncSession) -> dict[int, int]:
    """KRI count outside limits, linked to non-archived risks, per department."""
    result = await db.execute(
        select(Risk.department_id, func.count(KeyRiskIndicator.id))
        .join(Risk)
        .where(
            and_(
                Risk.status != RiskStatus.archived.value,
                or_(
                    KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                    KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
                ),
            )
        )
        .group_by(Risk.department_id)
    )
    return dict(result.all())


async def _sum_net_scores_by_dept(db: AsyncSession) -> dict[int, int]:
    """Total net_score for non-archived risks per department."""
    result = await db.execute(
        select(Risk.department_id, func.sum(Risk.net_score))
        .where(Risk.status != RiskStatus.archived.value)
        .group_by(Risk.department_id)
    )
    return {dept_id: (total or 0) for dept_id, total in result.all()}


@router.get("", response_model=list[DepartmentSummary])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("departments", "read")),
):
    """
    List all departments with summary statistics.

    Scoping: Non-privileged users see only their own department(s).
    Excludes: Inactive departments; archived entities in counts.
    """
    # 1. Load visible departments
    active_dept_ids = select(User.department_id).where(
        and_(User.department_id.isnot(None), User.is_active == True)
    ).distinct()

    query = (
        select(Department)
        .where(or_(Department.is_system == True, Department.id.in_(active_dept_ids)))
        .where(Department.is_active == True)
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


@router.get("/{department_id}", response_model=DepartmentDetail)
async def get_department(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("departments", "read")),
):
    """
    Get detailed department information with metrics.

    Access: 404 if department not found; 403 if out of user's scope.
    Excludes: Archived risks/controls/KRIs from counts and distributions.
    Metrics: risk_distribution uses RISK_LEVEL_RANGES; control_stats groups by form/frequency.
    """
    dept = await _assert_department_in_scope(department_id, db, current_user)
    
    # Count active users only (consistent with list_departments)
    user_count_result = await db.execute(
        select(func.count(User.id)).where(
            and_(User.department_id == department_id, User.is_active == True)
        )
    )
    user_count = user_count_result.scalar() or 0
    
    # Count risks
    risk_count_result = await db.execute(
        select(func.count(Risk.id)).where(
            and_(
                Risk.department_id == department_id,
                Risk.status != RiskStatus.archived.value
            )
        )
    )
    risk_count = risk_count_result.scalar() or 0
    
    # Count controls (non-archived)
    control_count_result = await db.execute(
        select(func.count(Control.id)).where(
            and_(
                Control.department_id == department_id,
                Control.status != ControlStatus.archived.value
            )
        )
    )
    control_count = control_count_result.scalar() or 0
    
    # Count KRIs (only from non-archived risks)
    kri_count_result = await db.execute(
        select(func.count(KeyRiskIndicator.id))
        .join(Risk)
        .where(
            and_(
                Risk.department_id == department_id,
                Risk.status != RiskStatus.archived.value
            )
        )
    )
    kri_count = kri_count_result.scalar() or 0

    # Risk distribution by level (single query, avoids N+1)
    risk_distribution_columns = []
    for level, (min_score, max_score) in RISK_LEVEL_RANGES.items():
        risk_distribution_columns.append(
            func.sum(
                case(
                    (
                        and_(
                            Risk.net_score >= min_score,
                            Risk.net_score <= max_score,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label(level)
        )

    risk_distribution_stmt = (
        select(*risk_distribution_columns)
        .where(
            and_(
                Risk.department_id == department_id,
                Risk.status != RiskStatus.archived.value,
            )
        )
    )
    risk_distribution_row = (await db.execute(risk_distribution_stmt)).one()
    risk_distribution = RiskDistribution(
        low=int(getattr(risk_distribution_row, "low") or 0),
        medium=int(getattr(risk_distribution_row, "medium") or 0),
        high=int(getattr(risk_distribution_row, "high") or 0),
        critical=int(getattr(risk_distribution_row, "critical") or 0),
    )
    
    # Risk by status (single grouped query)
    risk_by_status_stmt = (
        select(Risk.status, func.count(Risk.id))
        .where(
            and_(
                Risk.department_id == department_id,
                Risk.status != RiskStatus.archived.value,
            )
        )
        .group_by(Risk.status)
    )
    risk_by_status = {row[0]: row[1] for row in (await db.execute(risk_by_status_stmt)).all() if row[1] > 0}

    # Control stats
    control_stats = ControlStats(
        total=control_count,
        active=0,
        inactive=0,
        by_form={},
        by_frequency={}
    )
    
    # Controls by status (single grouped query for the two statuses we expose)
    control_status_stmt = (
        select(Control.status, func.count(Control.id))
        .where(
            and_(
                Control.department_id == department_id,
                Control.status.in_([ControlStatus.active.value, ControlStatus.inactive.value]),
            )
        )
        .group_by(Control.status)
    )
    status_counts = {row[0]: row[1] for row in (await db.execute(control_status_stmt)).all()}
    control_stats.active = int(status_counts.get(ControlStatus.active.value, 0))
    control_stats.inactive = int(status_counts.get(ControlStatus.inactive.value, 0))
    
    # Controls by form (single grouped query; preserves prior behavior including archived controls)
    control_form_stmt = (
        select(Control.control_form, func.count(Control.id))
        .where(Control.department_id == department_id)
        .group_by(Control.control_form)
    )
    control_stats.by_form = {row[0]: row[1] for row in (await db.execute(control_form_stmt)).all() if row[0] and row[1] > 0}
    
    # Controls by frequency (single grouped query; preserves prior behavior including archived controls)
    control_frequency_stmt = (
        select(Control.frequency, func.count(Control.id))
        .where(Control.department_id == department_id)
        .group_by(Control.frequency)
    )
    control_stats.by_frequency = {
        row[0]: row[1] for row in (await db.execute(control_frequency_stmt)).all() if row[0] and row[1] > 0
    }
    
    # Recent executions
    exec_result = await db.execute(
        select(ControlExecution)
        .join(Control)
        .options(
            selectinload(ControlExecution.control),
            selectinload(ControlExecution.executed_by)
        )
        .where(Control.department_id == department_id)
        .order_by(ControlExecution.executed_at.desc())
        .limit(DEPARTMENT_RECENT_EXECUTIONS_LIMIT)
    )
    executions = exec_result.scalars().all()
    
    recent_executions = [
        RecentExecution(
            id=ex.id,
            control_id=ex.control_id,
            control_name=ex.control.name if ex.control else "Unknown",
            result=ex.result,
            executed_at=ex.executed_at,
            executed_by=ex.executed_by.name if ex.executed_by else "Unknown"
        )
        for ex in executions
    ]
    
    return DepartmentDetail(
        id=dept.id,
        name=dept.name,
        code=dept.code,
        description=dept.description,
        created_at=dept.created_at,
        updated_at=dept.updated_at,
        user_count=user_count,
        risk_count=risk_count,
        control_count=control_count,
        kri_count=kri_count,
        risk_distribution=risk_distribution,
        risk_by_status=risk_by_status,
        control_stats=control_stats,
        recent_executions=recent_executions,
    )


@router.get("/{department_id}/risks", response_model=list[RiskSummary])
async def list_department_risks(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("departments", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    status: Optional[str] = None,
    min_net_score: Optional[int] = Query(None, ge=0, le=25, description="Filter risks with net_score >= this value"),
):
    """
    List risks for a specific department with KRI metadata.

    Access: 404 if not found; 403 if out of scope.
    Excludes: Archived risks by default (explicit status param overrides).
    Pagination: skip/limit with MAX_PAGE_SIZE cap.
    """
    if not check_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=403, detail="Permission denied: risks:read")

    await _assert_department_in_scope(department_id, db, current_user)
    
    # Load risks with their KRIs eagerly
    query = (
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.kris),  # Load KRIs for count and breach check
            selectinload(Risk.control_links),
        )
        .where(Risk.department_id == department_id)
    )
    
    if status:
        query = query.where(Risk.status == status)
    else:
        query = query.where(Risk.status != RiskStatus.archived.value)
    
    # Apply min_net_score filter for high-risk filtering
    if min_net_score is not None:
        query = query.where(Risk.net_score >= min_net_score)
    
    query = query.offset(skip).limit(limit).order_by(Risk.risk_id_code)
    
    result = await db.execute(query)
    risks = result.scalars().all()
    
    return [risk_to_summary(r) for r in risks]


@router.get("/{department_id}/controls", response_model=list[ControlSummary])
async def list_department_controls(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("departments", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    status: Optional[str] = None,
):
    """
    List controls for a specific department.

    Access: 404 if not found; 403 if out of scope.
    Excludes: Archived controls by default (explicit status param overrides).
    Pagination: skip/limit with MAX_PAGE_SIZE cap.
    """
    if not check_permission(current_user, "controls", "read"):
        raise HTTPException(status_code=403, detail="Permission denied: controls:read")

    await _assert_department_in_scope(department_id, db, current_user)
    
    query = select(Control).where(Control.department_id == department_id)
    
    if status:
        query = query.where(Control.status == status)
    else:
        # Default: exclude archived
        query = query.where(Control.status != ControlStatus.archived.value)
    
    # Eager load relationships for ControlSummary fields
    query = query.options(
        selectinload(Control.department),
        selectinload(Control.control_owner)
    ).offset(skip).limit(limit).order_by(Control.name)
    
    result = await db.execute(query)
    controls = result.scalars().all()
    
    # Map to ControlSummary with populated fields
    return [
        ControlSummary(
            id=c.id,
            name=c.name,
            description=c.description,
            department_id=c.department_id,
            department_name=c.department.name if c.department else None,
            frequency=normalize_control_frequency(c.frequency),
            risk_level=c.risk_level,
            status=ControlStatusEnum(c.status),
            control_form=ControlFormEnum(c.control_form),
            control_owner_name=c.control_owner.name if c.control_owner else None,
        )
        for c in controls
    ]


@router.get("/{department_id}/kris", response_model=list[KRIResponse])
async def list_department_kris(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("departments", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
):
    """
    List KRIs for a specific department.

    Access: 404 if not found; 403 if out of scope.
    Excludes: KRIs linked to archived risks.
    Pagination: skip/limit with MAX_PAGE_SIZE cap.
    """
    if not check_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=403, detail="Permission denied: risks:read")

    await _assert_department_in_scope(department_id, db, current_user)
    
    # Query KRIs via Risk (exclude archived risks)
    query = (
        select(KeyRiskIndicator)
        .join(Risk)
        .where(
            and_(
                Risk.department_id == department_id,
                Risk.status != RiskStatus.archived.value
            )
        )
        .options(
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.department),
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.owner),
            joinedload(KeyRiskIndicator.reporting_owner),
        )
        .offset(skip)
        .limit(limit)
    )
    
    result = await db.execute(query)
    kris = result.scalars().unique().all()
    
    # Map to response with metadata (same logic as in kris.py)
    items = []
    for k in kris:
        res = KRIResponse.model_validate(k)
        # Add owner info
        if k.reporting_owner:
            res.reporting_owner_name = k.reporting_owner.name
        if k.risk:
            res.risk_category = k.risk.category
            res.risk_process = k.risk.process
            if k.risk.owner:
                res.risk_owner_name = k.risk.owner.name
            if k.risk.department:
                res.department_name = k.risk.department.name
        items.append(res)
        
    return items
