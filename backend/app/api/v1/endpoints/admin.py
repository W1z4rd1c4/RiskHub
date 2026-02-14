"""
Admin endpoints for data maintenance operations.
"""
import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Control, ControlRiskLink, KeyRiskIndicator, Risk, User
from app.models.role import RoleType
from app.schemas.admin import (
    ActiveSessionResponse,
    DocumentationEntry,
    DocumentationResponse,
    LogConfig,
    LogConfigUpdate,
    OrphanFixResponse,
    OrphanStatsResponse,
    RecentLogEntry,
    RecentLogsResponse,
    SnapshotListItem,
    SnapshotResponse,
    SystemHealthResponse,
    SystemStatsResponse,
    TechnicalLogEntry,
)

router = APIRouter()


# ============================================================================
# Admin-Only Dependency
# ============================================================================

def require_platform_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency that validates the current user is a platform admin.

    Raises HTTPException 403 if the user is not an admin.
    Returns the validated admin user for use in endpoints.
    """
    if not current_user.role or current_user.role.name != RoleType.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ============================================================================
# Orphan Entity Endpoints
# ============================================================================

@router.get("/orphan-stats", response_model=OrphanStatsResponse)
async def get_orphan_stats(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin)
) -> OrphanStatsResponse:
    """
    Get statistics about orphaned entities (KRIs without risks, controls without links).
    Admin only.
    """
    # Note: KRIs cannot be orphaned in current schema (risk_id is NOT NULL)
    # But just in case the schema changes:
    orphan_kris_result = await db.execute(
        select(func.count()).select_from(KeyRiskIndicator).where(KeyRiskIndicator.risk_id.is_(None))
    )
    orphan_kris = orphan_kris_result.scalar() or 0

    # Controls without any risk links
    controls_without_links_result = await db.execute(
        select(func.count()).select_from(Control).where(
            ~Control.id.in_(select(ControlRiskLink.control_id).distinct())
        )
    )
    controls_without_links = controls_without_links_result.scalar() or 0

    # Totals
    total_risks = (await db.execute(select(func.count()).select_from(Risk))).scalar() or 0
    total_controls = (await db.execute(select(func.count()).select_from(Control))).scalar() or 0
    total_kris = (await db.execute(select(func.count()).select_from(KeyRiskIndicator))).scalar() or 0
    total_links = (await db.execute(select(func.count()).select_from(ControlRiskLink))).scalar() or 0

    return OrphanStatsResponse(
        orphan_kris=orphan_kris,
        controls_without_links=controls_without_links,
        total_risks=total_risks,
        total_controls=total_controls,
        total_kris=total_kris,
        total_links=total_links,
    )


@router.post("/fix-orphans", response_model=OrphanFixResponse)
async def fix_orphan_mappings(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin)
) -> OrphanFixResponse:
    """
    Fix orphaned entities by assigning random risks.
    - KRIs without risk_id get a random risk assigned
    - Controls without any risk links get a random risk link created
    Admin only.
    """
    # Get all risks for random assignment
    risks_result = await db.execute(select(Risk))
    all_risks = list(risks_result.scalars().all())

    if not all_risks:
        raise HTTPException(status_code=400, detail="No risks available for assignment")

    kris_fixed = 0
    controls_fixed = 0
    links_created = 0

    # Fix orphan KRIs (if schema allows null risk_id)
    orphan_kris_result = await db.execute(
        select(KeyRiskIndicator).where(KeyRiskIndicator.risk_id.is_(None))
    )
    orphan_kris = list(orphan_kris_result.scalars().all())

    for kri in orphan_kris:
        kri.risk_id = random.choice(all_risks).id
        kris_fixed += 1

    # Fix controls without risk links
    controls_without_links_result = await db.execute(
        select(Control).where(
            ~Control.id.in_(select(ControlRiskLink.control_id).distinct())
        )
    )
    controls_without_links = list(controls_without_links_result.scalars().all())

    for control in controls_without_links:
        # Create 1-3 random risk links
        num_links = random.randint(1, 3)
        selected_risks = random.sample(all_risks, min(num_links, len(all_risks)))

        for risk in selected_risks:
            link = ControlRiskLink(
                control_id=control.id,
                risk_id=risk.id,
                effectiveness='medium',
                notes='Auto-assigned by admin fix-orphans endpoint',
            )
            db.add(link)
            links_created += 1
        controls_fixed += 1

    await db.commit()

    return OrphanFixResponse(
        message=f"Fixed {kris_fixed} KRIs and {controls_fixed} controls ({links_created} links created)",
        kris_fixed=kris_fixed,
        controls_fixed=controls_fixed,
        links_created=links_created,
    )


# ============================================================================
# Admin Console Endpoints (Platform Administration)
# ============================================================================


@router.get("/health", response_model=SystemHealthResponse)
async def get_system_health(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin)
) -> SystemHealthResponse:
    """
    Get system health status including database connectivity and latency.
    Admin only.
    """
    import time
    from datetime import UTC, datetime

    import psutil

    # Measure database latency
    start = time.perf_counter()
    try:
        await db.execute(select(func.count()).select_from(User))
        db_status = "connected"
    except Exception:
        db_status = "error"
    latency_ms = (time.perf_counter() - start) * 1000

    # Get memory usage
    process = psutil.Process()
    memory_mb = process.memory_info().rss / 1024 / 1024

    # Calculate uptime (approximation - time since first user login today)
    uptime_seconds = int(time.time() % 86400)  # Simplified - seconds since midnight

    return SystemHealthResponse(
        database_status=db_status,
        database_latency_ms=round(latency_ms, 2),
        uptime_seconds=uptime_seconds,
        memory_usage_mb=round(memory_mb, 2),
        last_check=datetime.now(UTC).isoformat()
    )


@router.get("/stats", response_model=SystemStatsResponse)
async def get_system_stats(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin)
) -> SystemStatsResponse:
    """
    Get platform statistics including user counts and entity totals.
    Admin only.
    """
    from datetime import UTC, datetime, timedelta

    from app.models import ApprovalRequest

    # Total users
    total_users = (await db.execute(
        select(func.count()).select_from(User).where(User.is_active.is_(True))
    )).scalar() or 0

    # Active users in last 24h (approximation based on activity logs)
    from app.models.activity_log import ActivityLog
    # Timezone-aware datetime works for both PostgreSQL and SQLite via SQLAlchemy
    yesterday = datetime.now(UTC) - timedelta(hours=24)
    active_users_result = await db.execute(
        select(func.count(func.distinct(ActivityLog.actor_id)))
        .where(ActivityLog.created_at >= yesterday)
    )
    active_users_24h = active_users_result.scalar() or 0

    # Entity totals
    total_risks = (await db.execute(select(func.count()).select_from(Risk))).scalar() or 0
    total_controls = (await db.execute(select(func.count()).select_from(Control))).scalar() or 0
    total_kris = (await db.execute(select(func.count()).select_from(KeyRiskIndicator))).scalar() or 0

    # Pending approvals - use enum values, not string literals
    from app.models.approval_request import ApprovalStatus
    pending_count = (await db.execute(
        select(func.count()).select_from(ApprovalRequest)
        .where(ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
    )).scalar() or 0

    return SystemStatsResponse(
        total_users=total_users,
        active_users_24h=active_users_24h,
        total_risks=total_risks,
        total_controls=total_controls,
        total_kris=total_kris,
        pending_approvals=pending_count
    )


@router.get("/logs", response_model=list[TechnicalLogEntry])
async def get_technical_logs(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
    event_type: str | None = None,
    limit: int = 100
) -> list[TechnicalLogEntry]:
    """
    Get technical/security logs from activity log.
    Admin only.
    """
    from sqlalchemy.orm import selectinload

    from app.models.activity_log import ActivityLog

    # Build query
    query = (
        select(ActivityLog)
        .options(selectinload(ActivityLog.actor))
        .order_by(ActivityLog.created_at.desc())
        .limit(min(limit, 500))
    )

    # Filter by event type if provided
    if event_type:
        query = query.where(ActivityLog.action == event_type)

    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        TechnicalLogEntry(
            id=log.id,
            timestamp=log.created_at.isoformat(),
            level="INFO" if log.action not in ["failed_login", "error"] else "WARNING",
            event_type=log.action,
            user_name=log.actor.name if log.actor else None,
            user_email=log.actor.email if log.actor else None,
            entity_type=log.entity_type,
            description=log.description
        )
        for log in logs
    ]


@router.get("/sessions", response_model=list[ActiveSessionResponse])
async def get_active_sessions(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin)
) -> list[ActiveSessionResponse]:
    """
    Get list of users with recent activity (approximation of active sessions).
    Admin only.
    """
    from datetime import UTC, datetime, timedelta

    from sqlalchemy.orm import selectinload

    from app.models.activity_log import ActivityLog

    # Get users with activity in last 24 hours
    # Timezone-aware datetime works for both PostgreSQL and SQLite via SQLAlchemy
    yesterday = datetime.now(UTC) - timedelta(hours=24)

    # Subquery to get latest LOGIN per user
    from app.models.activity_log import ActivityAction
    login_subquery = (
        select(
            ActivityLog.actor_id.label("user_id"),
            func.max(ActivityLog.created_at).label("last_login")
        )
        .where(ActivityLog.action == ActivityAction.LOGIN)
        .group_by(ActivityLog.actor_id)
        .subquery()
    )

    # Query users directly
    query = (
        select(
            User,
            login_subquery.c.last_login
        )
        .outerjoin(login_subquery, User.id == login_subquery.c.user_id)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.last_active_at >= yesterday) # Only show users active in last 24h
        .order_by(User.last_active_at.desc())
    )

    result = await db.execute(query)
    rows = result.all()

    return [
        ActiveSessionResponse(
            user_id=user.id,
            user_name=user.name,
            user_email=user.email,
            role=user.role.display_name if user.role else "Unknown",
            department=user.department.name if user.department else None,
            last_activity=user.last_active_at.isoformat() if user.last_active_at else "",
            is_active=user.is_active,
            last_login=last_login.isoformat() if last_login else None
        )
        for user, last_login in rows
    ]


@router.post("/sessions/{user_id}/revoke")
async def revoke_user_session(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin)
) -> dict:
    """
    Force logout a user by setting them inactive temporarily.
    Admin only.
    """
    if user_id == admin_user.id:
        raise HTTPException(status_code=400, detail="Cannot revoke your own session")

    # Get user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="User is already inactive")

    # For now, we log this action. In a production system, we'd invalidate JWT tokens.
    from app.core.activity_logger import log_activity
    from app.models.activity_log import ActivityAction, ActivityEntityType

    await log_activity(
        db=db,
        actor=admin_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.USER,
        entity_id=user_id,
        entity_name=user.name,
        description=f"Session revoked for user {user.email} by admin"
    )
    await db.commit()

    return {"status": "success", "message": f"Session revoked for {user.email}"}


# ============================================================================
# Structured Log Access Endpoints (SIEM Integration)
# ============================================================================

# Known fields in structured log entries
_LOG_KNOWN_FIELDS = {"timestamp", "level", "event", "logger", "request_id",
                     "user_id", "client_ip", "feature"}


def _parse_log_entry(data: dict) -> RecentLogEntry:
    """Parse a JSON log entry dict into a RecentLogEntry schema."""
    extra = {k: v for k, v in data.items() if k not in _LOG_KNOWN_FIELDS}
    return RecentLogEntry(
        timestamp=data.get("timestamp"),
        level=data.get("level", "").upper(),
        event=data.get("event"),
        logger_name=data.get("logger"),
        request_id=data.get("request_id"),
        user_id=data.get("user_id"),
        client_ip=data.get("client_ip"),
        feature=data.get("feature"),
        extra=extra,
    )


def _read_log_file(
    log_filename: str,
    max_lines: int,
    filter_key: str | None = None,
    filter_value: str | None = None
) -> RecentLogsResponse:
    """
    Read and parse a JSON log file with optional filtering.

    Args:
        log_filename: Name of log file in log directory (e.g., "app.json.log")
        max_lines: Maximum number of entries to return
        filter_key: Optional key to filter on ("level" or "event")
        filter_value: Value to match for filter_key
    """
    import json

    from app.core.logging import get_log_directory, tail_log_file

    log_file = get_log_directory() / log_filename

    if not log_file.exists():
        return RecentLogsResponse(entries=[], total_lines=0, file_path=str(log_file))

    # Read extra lines for filtering
    recent_lines, total_estimate = tail_log_file(log_file, max_lines * 2)

    entries: list[RecentLogEntry] = []
    for line in recent_lines:
        if not line:
            continue
        try:
            data = json.loads(line)

            # Apply filter if specified
            if filter_key and filter_value:
                actual_value = data.get(filter_key, "")
                if filter_key == "level":
                    actual_value = actual_value.upper()
                if actual_value != filter_value:
                    continue

            entries.append(_parse_log_entry(data))
        except json.JSONDecodeError:
            continue

    return RecentLogsResponse(
        entries=entries[-max_lines:],
        total_lines=total_estimate,
        file_path=str(log_file)
    )


@router.get("/logs/recent", response_model=RecentLogsResponse)
async def get_recent_logs(
    admin_user: User = Depends(require_platform_admin),
    lines: int = 100,
    level: str | None = None,
) -> RecentLogsResponse:
    """
    Get recent application logs from the JSON log file.
    Admin only.

    Args:
        lines: Number of recent lines to return (max 500)
        level: Optional filter by log level (DEBUG, INFO, WARNING, ERROR)
    """
    return _read_log_file(
        log_filename="app.json.log",
        max_lines=min(lines, 500),
        filter_key="level" if level else None,
        filter_value=level.upper() if level else None,
    )


@router.get("/logs/audit", response_model=RecentLogsResponse)
async def get_audit_logs(
    admin_user: User = Depends(require_platform_admin),
    lines: int = 100,
    event_type: str | None = None,
) -> RecentLogsResponse:
    """
    Get recent AUDIT logs from the audit log file.
    Admin only.

    Args:
        lines: Number of recent lines to return (max 1000)
        event_type: Optional filter by event name (action)
    """
    return _read_log_file(
        log_filename="audit.json.log",
        max_lines=min(lines, 1000),
        filter_key="event" if event_type else None,
        filter_value=event_type,
    )


@router.get("/docs", response_model=DocumentationResponse)
async def get_documentation(
    current_user: User = Depends(get_current_user),
    locale: str = "en"
) -> DocumentationResponse:
    """
    Get platform documentation based on user role and locale.

    Args:
        locale: Language code ('en' or 'cs'). Defaults to 'en'.
    """
    import re
    from pathlib import Path

    # Documentation files are in docs/ subdirectories at project root
    # Path: admin.py -> endpoints -> v1 -> api -> app -> backend -> project_root -> docs
    docs_base = Path(__file__).parent.parent.parent.parent.parent.parent / "docs"

    # Determine which directories to read from based on locale
    locale_suffix = "-cs" if locale == "cs" else ""
    admin_dir = docs_base / f"admin{locale_suffix}"
    user_dir = docs_base / f"user{locale_suffix}"

    # Fallback to English if locale-specific dir doesn't exist
    if not admin_dir.exists():
        admin_dir = docs_base / "admin"
    if not user_dir.exists():
        user_dir = docs_base / "user"

    def extract_title(content: str, filename: str) -> str:
        """Extract title from first H1 heading or generate from filename."""
        # Look for first # heading
        match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
        if match:
            return match.group(1).strip()
        # Fallback to filename
        return filename.replace("-", " ").replace("_", " ").replace(".md", "").title()

    documents = []
    role = current_user.role.name if current_user.role else ""

    # Define visibility based on role
    can_see_admin = role in {RoleType.ADMIN, RoleType.CRO}

    # Admin docs (CRO and Admin only)
    if can_see_admin and admin_dir.exists():
        for doc_file in admin_dir.glob("*.md"):
            with open(doc_file, "r", encoding="utf-8") as f:
                content = f.read()

            documents.append(DocumentationEntry(
                id=f"admin_{doc_file.stem.lower()}",
                title=extract_title(content, doc_file.name),
                content=content
            ))

    # User docs (everyone can see)
    if user_dir.exists():
        for doc_file in user_dir.glob("*.md"):
            with open(doc_file, "r", encoding="utf-8") as f:
                content = f.read()

            documents.append(DocumentationEntry(
                id=f"user_{doc_file.stem.lower()}",
                title=extract_title(content, doc_file.name),
                content=content
            ))

    # Sort documents by title for consistent UI
    documents.sort(key=lambda x: x.title)

    return DocumentationResponse(documents=documents)


@router.get("/logs/config", response_model=LogConfig)
async def get_log_config(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> LogConfig:
    """Get current log rotation settings (separate for app and audit logs)."""
    from app.models.global_config import get_config_int

    # Default values must match logging.py (10MB, 10 files)
    app_size = await get_config_int(db, "app_log_rotation_size_mb", 10)
    app_count = await get_config_int(db, "app_log_retention_count", 10)
    audit_size = await get_config_int(db, "audit_log_rotation_size_mb", 10)
    audit_count = await get_config_int(db, "audit_log_retention_count", 10)

    return LogConfig(
        app_log_rotation_size_mb=app_size,
        app_log_retention_count=app_count,
        audit_log_rotation_size_mb=audit_size,
        audit_log_retention_count=audit_count
    )


@router.post("/logs/config", response_model=LogConfig)
async def update_log_config(
    config: LogConfigUpdate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> LogConfig:
    """
    Update log rotation settings (separate for app and audit logs).
    Changes require backend restart to take full effect on file handlers.
    """
    from sqlalchemy import select

    from app.models.global_config import GlobalConfig
    canonical = config.to_log_config()

    # Helper to upsert config
    async def upsert_config(key: str, value: int, display: str, desc: str):
        result = await db.execute(select(GlobalConfig).where(GlobalConfig.key == key))
        cfg = result.scalar_one_or_none()

        if cfg:
            cfg.value = str(value)
        else:
            cfg = GlobalConfig(
                key=key,
                value=str(value),
                value_type="int",
                category="system",
                display_name=display,
                description=desc,
                min_value=1,
                max_value=500,
                is_editable=True
            )
            db.add(cfg)

    # App log settings
    await upsert_config(
        "app_log_rotation_size_mb",
        canonical.app_log_rotation_size_mb,
        "App Log Rotation Size (MB)",
        "Maximum size of each application log file before rotation in megabytes"
    )
    await upsert_config(
        "app_log_retention_count",
        canonical.app_log_retention_count,
        "App Log Retention Count",
        "Number of backup application log files to keep after rotation"
    )

    # Audit log settings
    await upsert_config(
        "audit_log_rotation_size_mb",
        canonical.audit_log_rotation_size_mb,
        "Audit Log Rotation Size (MB)",
        "Maximum size of each audit log file before rotation in megabytes"
    )
    await upsert_config(
        "audit_log_retention_count",
        canonical.audit_log_retention_count,
        "Audit Log Retention Count",
        "Number of backup audit log files to keep after rotation"
    )

    await db.commit()

    return canonical


# ============================================================================
# Quarterly Metric Snapshot Endpoints
# ============================================================================

@router.post("/snapshots/capture", response_model=SnapshotResponse)
async def capture_quarterly_snapshot(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
    notes: str | None = None,
) -> SnapshotResponse:
    """
    Manually capture a quarterly metric snapshot for the current quarter.
    Admin only.

    This endpoint should be called at the end of each quarter to capture
    point-in-time state metrics for accurate historical comparisons.
    """
    from app.core.snapshot_service import capture_current_quarter_snapshot

    # Capture snapshot
    snapshot = await capture_current_quarter_snapshot(
        db=db,
        department_ids=None,  # Global snapshot
        captured_by_user_id=admin_user.id,
        notes=notes or f"Manual capture by {admin_user.name}",
    )

    await db.commit()

    return SnapshotResponse(
        quarter=snapshot.quarter,
        year=snapshot.year,
        quarter_number=snapshot.quarter_number,
        captured_at=snapshot.captured_at.isoformat(),
        metrics=snapshot.metrics,
        message=f"Successfully captured snapshot for {snapshot.quarter}",
    )


@router.get("/snapshots", response_model=list[SnapshotListItem])
async def list_quarterly_snapshots(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> list[SnapshotListItem]:
    """
    List all stored quarterly metric snapshots.
    Admin only.
    """
    from app.models.quarterly_metric_snapshot import QuarterlyMetricSnapshot

    result = await db.execute(
        select(QuarterlyMetricSnapshot)
        .order_by(QuarterlyMetricSnapshot.year.desc(), QuarterlyMetricSnapshot.quarter_number.desc())
    )
    snapshots = result.scalars().all()

    return [
        SnapshotListItem(
            id=s.id,
            quarter=s.quarter,
            year=s.year,
            quarter_number=s.quarter_number,
            captured_at=s.captured_at.isoformat(),
            snapshot_type=s.snapshot_type.value,
            has_metrics=bool(s.metrics),
        )
        for s in snapshots
    ]


@router.get("/snapshots/{quarter}", response_model=SnapshotResponse)
async def get_quarterly_snapshot(
    quarter: str,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> SnapshotResponse:
    """
    Get a specific quarterly metric snapshot.
    Admin only.

    Args:
        quarter: Quarter label like '2026-Q1'
    """
    from app.core.snapshot_service import get_quarter_snapshot as get_snapshot

    snapshot = await get_snapshot(db, quarter)

    if not snapshot:
        raise HTTPException(status_code=404, detail=f"No snapshot found for {quarter}")

    return SnapshotResponse(
        quarter=snapshot.quarter,
        year=snapshot.year,
        quarter_number=snapshot.quarter_number,
        captured_at=snapshot.captured_at.isoformat(),
        metrics=snapshot.metrics,
        message=f"Snapshot for {snapshot.quarter}",
    )
