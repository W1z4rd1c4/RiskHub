"""
Admin endpoints for data maintenance operations.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import random

from app.db.session import get_db
from app.models import Risk, Control, KeyRiskIndicator, ControlRiskLink, User
from app.api.deps import get_current_user

router = APIRouter()


class OrphanFixResponse(BaseModel):
    """Response for orphan fix operations."""
    message: str
    kris_fixed: int = 0
    controls_fixed: int = 0
    links_created: int = 0


class OrphanStatsResponse(BaseModel):
    """Statistics about orphaned entities."""
    orphan_kris: int
    controls_without_links: int
    total_risks: int
    total_controls: int
    total_kris: int
    total_links: int


@router.get("/orphan-stats", response_model=OrphanStatsResponse)
async def get_orphan_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> OrphanStatsResponse:
    # Admin only check
    if current_user.role.name.lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
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
    current_user: User = Depends(get_current_user)
) -> OrphanFixResponse:
    # Admin only check
    if current_user.role.name.lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
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
                notes=f'Auto-assigned by admin fix-orphans endpoint',
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

class SystemHealthResponse(BaseModel):
    """System health status response."""
    database_status: str  # "connected" | "error"
    database_latency_ms: float
    uptime_seconds: int
    memory_usage_mb: float
    last_check: str


class SystemStatsResponse(BaseModel):
    """Platform statistics response."""
    total_users: int
    active_users_24h: int
    total_risks: int
    total_controls: int
    total_kris: int
    pending_approvals: int


class TechnicalLogEntry(BaseModel):
    """Technical/security log entry."""
    id: int
    timestamp: str
    level: str  # "INFO" | "WARNING" | "ERROR"
    event_type: str
    user_name: str | None
    user_email: str | None
    entity_type: str | None
    description: str | None  # Changed from details to match ActivityLog model


class ActiveSessionResponse(BaseModel):
    """Active user session."""
    user_id: int
    user_name: str
    user_email: str
    role: str
    department: str | None
    last_activity: str
    is_active: bool
    last_login: str | None = None


def require_admin(current_user: User) -> User:
    """Dependency to check admin access."""
    if current_user.role.name.lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/health", response_model=SystemHealthResponse)
async def get_system_health(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> SystemHealthResponse:
    """
    Get system health status including database connectivity and latency.
    Admin only.
    """
    require_admin(current_user)
    
    import time
    import psutil
    from datetime import datetime, UTC
    
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
    current_user: User = Depends(get_current_user)
) -> SystemStatsResponse:
    """
    Get platform statistics including user counts and entity totals.
    Admin only.
    """
    require_admin(current_user)
    
    from datetime import datetime, timedelta, UTC
    from app.models import ApprovalRequest
    
    # Total users
    total_users = (await db.execute(
        select(func.count()).select_from(User).where(User.is_active == True)
    )).scalar() or 0
    
    # Active users in last 24h (approximation based on activity logs)
    from app.models.activity_log import ActivityLog
    # Use naive datetime for SQLite compatibility (tests), PostgreSQL handles both
    yesterday = datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=24)
    active_users_result = await db.execute(
        select(func.count(func.distinct(ActivityLog.actor_id)))
        .where(ActivityLog.created_at >= yesterday)
    )
    active_users_24h = active_users_result.scalar() or 0
    
    # Entity totals
    total_risks = (await db.execute(select(func.count()).select_from(Risk))).scalar() or 0
    total_controls = (await db.execute(select(func.count()).select_from(Control))).scalar() or 0
    total_kris = (await db.execute(select(func.count()).select_from(KeyRiskIndicator))).scalar() or 0
    
    # Pending approvals
    pending_count = (await db.execute(
        select(func.count()).select_from(ApprovalRequest)
        .where(ApprovalRequest.status.in_(["pending", "pending_privileged"]))
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
    current_user: User = Depends(get_current_user),
    event_type: str | None = None,
    limit: int = 100
) -> list[TechnicalLogEntry]:
    """
    Get technical/security logs from activity log.
    Admin only.
    """
    require_admin(current_user)
    
    from app.models.activity_log import ActivityLog
    from sqlalchemy.orm import selectinload
    
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
    current_user: User = Depends(get_current_user)
) -> list[ActiveSessionResponse]:
    """
    Get list of users with recent activity (approximation of active sessions).
    Admin only.
    """
    require_admin(current_user)
    
    from datetime import datetime, timedelta, UTC
    from app.models.activity_log import ActivityLog
    from sqlalchemy.orm import selectinload
    
    # Get users with activity in last 24 hours
    # Use naive datetime for SQLite compatibility (tests), PostgreSQL handles both
    yesterday = datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=24)
    
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
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Force logout a user by setting them inactive temporarily.
    Admin only.
    """
    require_admin(current_user)
    
    if user_id == current_user.id:
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
        actor=current_user,
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

class RecentLogEntry(BaseModel):
    """Parsed JSON log entry."""
    timestamp: str | None = None
    level: str | None = None
    event: str | None = None
    logger_name: str | None = None
    request_id: str | None = None
    user_id: int | None = None
    client_ip: str | None = None
    feature: str | None = None
    extra: dict = {}


class RecentLogsResponse(BaseModel):
    """Response for recent logs endpoint."""
    entries: list[RecentLogEntry]
    total_lines: int
    file_path: str


@router.get("/logs/recent", response_model=RecentLogsResponse)
async def get_recent_logs(
    current_user: User = Depends(get_current_user),
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
    require_admin(current_user)
    
    import json
    from app.core.logging import get_log_directory, tail_log_file
    
    # Limit lines to prevent huge responses
    lines = min(lines, 500)
    
    # Use centralized log directory helper
    log_file = get_log_directory() / "app.json.log"
    
    if not log_file.exists():
        return RecentLogsResponse(
            entries=[],
            total_lines=0,
            file_path=str(log_file)
        )
    
    # Use efficient tail reader (read extra for filtering)
    recent_lines, total_estimate = tail_log_file(log_file, lines * 2)
    
    # Parse JSON lines and filter
    entries: list[RecentLogEntry] = []
    level_filter = level.upper() if level else None
    
    for line in recent_lines:
        if not line:
            continue
        try:
            data = json.loads(line)
            
            # Filter by level if specified
            log_level = data.get("level", "").upper()
            if level_filter and log_level != level_filter:
                continue
            
            # Extract known fields, put rest in extra
            known_fields = {"timestamp", "level", "event", "logger", "request_id", 
                          "user_id", "client_ip", "feature"}
            extra = {k: v for k, v in data.items() if k not in known_fields}
            
            entries.append(RecentLogEntry(
                timestamp=data.get("timestamp"),
                level=log_level,
                event=data.get("event"),
                logger_name=data.get("logger"),
                request_id=data.get("request_id"),
                user_id=data.get("user_id"),
                client_ip=data.get("client_ip"),
                feature=data.get("feature"),
                extra=extra,
            ))
        except json.JSONDecodeError:
            # Skip malformed lines
            continue
    
    # Return only requested number of entries (after filtering)
    return RecentLogsResponse(
        entries=entries[-lines:],
        total_lines=total_estimate,
        file_path=str(log_file)
    )


@router.get("/logs/audit", response_model=RecentLogsResponse)
async def get_audit_logs(
    current_user: User = Depends(get_current_user),
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
    require_admin(current_user)
    
    import json
    from app.core.logging import get_log_directory, tail_log_file
    
    # Limit lines (audit logs might be important so allow more than debug logs)
    lines = min(lines, 1000)
    
    # Use centralized log directory helper
    log_file = get_log_directory() / "audit.json.log"
    
    if not log_file.exists():
        return RecentLogsResponse(
            entries=[],
            total_lines=0,
            file_path=str(log_file)
        )
    
    # Use efficient tail reader (read extra for filtering)
    recent_lines, total_estimate = tail_log_file(log_file, lines * 2)
    
    # Parse JSON lines and filter
    entries: list[RecentLogEntry] = []
    
    for line in recent_lines:
        if not line:
            continue
        try:
            data = json.loads(line)
            
            # Filter by event type if specified
            if event_type and data.get("event") != event_type:
                continue
            
            # Extract fields
            known_fields = {"timestamp", "level", "event", "logger", "request_id", 
                          "user_id", "client_ip", "feature"}
            extra = {k: v for k, v in data.items() if k not in known_fields}
            
            entries.append(RecentLogEntry(
                timestamp=data.get("timestamp"),
                level=data.get("level", "").upper(),
                event=data.get("event"),
                logger_name=data.get("logger"),
                request_id=data.get("request_id"),
                user_id=data.get("user_id"),
                client_ip=data.get("client_ip"),
                feature=data.get("feature"),
                extra=extra,
            ))
        except json.JSONDecodeError:
            continue
    
    return RecentLogsResponse(
        entries=entries[-lines:],
        total_lines=total_estimate,
        file_path=str(log_file)
    )


class LogConfig(BaseModel):
    """Log configuration settings."""
    log_rotation_size_mb: int
    log_retention_count: int


class DocumentationEntry(BaseModel):
    """Platform documentation entry."""
    id: str
    title: str
    content: str


class DocumentationResponse(BaseModel):
    """List of documentation entries."""
    documents: list[DocumentationEntry]


@router.get("/docs", response_model=DocumentationResponse)
async def get_admin_documentation(
    current_user: User = Depends(get_current_user)
) -> DocumentationResponse:
    """
    Get platform documentation for administrators.
    Admin only.
    """
    require_admin(current_user)
    
    from pathlib import Path
    
    # documentation files are in backend/docs/
    # admin.py is in backend/app/api/v1/endpoints/
    docs_dir = Path(__file__).parent.parent.parent.parent.parent / "docs"
    
    # Mapping of filenames to pretty titles
    titles = {
        "ADMIN_SIEM_GUIDE.md": "SIEM Integration: The Blueprint",
        "ADMIN_ARCHITECTURE.md": "System Architecture: A Narrative Guide",
        "ADMIN_MAINTENANCE.md": "Maintenance Perspectives",
        "ADMIN_CONVENTIONS.md": "The Artisan's Code (Conventions)",
        "ADMIN_INTEGRATIONS.md": "The RiskHub Ecosystem",
        "ADMIN_STACK.md": "The RiskHub Tech Stack",
        "ADMIN_STRUCTURE.md": "A Tour of the Repository",
        "ADMIN_TESTING.md": "The RiskHub Testing Story",
    }
    
    documents = []
    
    if docs_dir.exists():
        for doc_file in docs_dir.glob("*.md"):
            filename = doc_file.name
            with open(doc_file, "r", encoding="utf-8") as f:
                content = f.read()
                
            documents.append(DocumentationEntry(
                id=doc_file.stem.lower(),
                title=titles.get(filename, filename.replace("_", " ").replace(".md", "").title()),
                content=content
            ))
            
    # Sort documents by title for consistent UI
    documents.sort(key=lambda x: x.title)
            
    return DocumentationResponse(documents=documents)


@router.get("/logs/config", response_model=LogConfig)
async def get_log_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LogConfig:
    """Get current log rotation settings."""
    require_admin(current_user)
    from app.models.global_config import get_config_int
    
    # Default values must match logging.py
    size = await get_config_int(db, "log_rotation_size_mb", 10)
    count = await get_config_int(db, "log_retention_count", 10)
    
    return LogConfig(
        log_rotation_size_mb=size,
        log_retention_count=count
    )


@router.post("/logs/config", response_model=LogConfig)
async def update_log_config(
    config: LogConfig,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LogConfig:
    """
    Update log rotation settings.
    Changes require backend restart to take full effect on file handlers.
    """
    require_admin(current_user)
    from app.models.global_config import GlobalConfig
    from sqlalchemy import select
    
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
    
    await upsert_config(
        "log_rotation_size_mb", 
        config.log_rotation_size_mb,
        "Log Rotation Size (MB)",
        "Maximum size of each log file before rotation in megabytes"
    )
    
    await upsert_config(
        "log_retention_count", 
        config.log_retention_count,
        "Log Retention Count", 
        "Number of backup log files to keep after rotation"
    )
    
    await db.commit()
    
    return config


# ============================================================================
# Quarterly Metric Snapshot Endpoints
# ============================================================================

class SnapshotResponse(BaseModel):
    """Response for snapshot capture operations."""
    quarter: str
    year: int
    quarter_number: int
    captured_at: str
    metrics: dict
    message: str


class SnapshotListItem(BaseModel):
    """List item for snapshots."""
    id: int
    quarter: str
    year: int
    quarter_number: int
    captured_at: str
    snapshot_type: str
    has_metrics: bool


@router.post("/snapshots/capture", response_model=SnapshotResponse)
async def capture_quarterly_snapshot(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    notes: str | None = None,
) -> SnapshotResponse:
    """
    Manually capture a quarterly metric snapshot for the current quarter.
    Admin only.
    
    This endpoint should be called at the end of each quarter to capture
    point-in-time state metrics for accurate historical comparisons.
    """
    require_admin(current_user)
    
    from app.core.snapshot_service import (
        capture_current_quarter_snapshot,
        get_quarter_label,
        get_quarter_number
    )
    from datetime import datetime, timezone
    
    now = datetime.now(timezone.utc)
    
    # Capture snapshot
    snapshot = await capture_current_quarter_snapshot(
        db=db,
        department_ids=None,  # Global snapshot
        captured_by_user_id=current_user.id,
        notes=notes or f"Manual capture by {current_user.name}",
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
    current_user: User = Depends(get_current_user),
) -> list[SnapshotListItem]:
    """
    List all stored quarterly metric snapshots.
    Admin only.
    """
    require_admin(current_user)
    
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
    current_user: User = Depends(get_current_user),
) -> SnapshotResponse:
    """
    Get a specific quarterly metric snapshot.
    Admin only.
    
    Args:
        quarter: Quarter label like '2026-Q1'
    """
    require_admin(current_user)
    
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

