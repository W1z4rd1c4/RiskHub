"""
Admin endpoint schemas.

Pydantic models for admin console endpoints including:
- Orphan entity management
- System health and stats
- Session management
- Log configuration and access
- Quarterly metric snapshots
- Documentation access
"""
from pydantic import BaseModel, Field


# ============================================================================
# Orphan Entity Schemas
# ============================================================================

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


# ============================================================================
# System Health and Stats Schemas
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


# ============================================================================
# Log and Session Schemas
# ============================================================================

class TechnicalLogEntry(BaseModel):
    """Technical/security log entry."""
    id: int
    timestamp: str
    level: str  # "INFO" | "WARNING" | "ERROR"
    event_type: str
    user_name: str | None
    user_email: str | None
    entity_type: str | None
    description: str | None


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
    extra: dict = Field(default_factory=dict)


class RecentLogsResponse(BaseModel):
    """Response for recent logs endpoint."""
    entries: list[RecentLogEntry]
    total_lines: int
    file_path: str


class LogConfig(BaseModel):
    """Log rotation configuration with separate app and audit settings."""
    # Application log settings
    app_log_rotation_size_mb: int
    app_log_retention_count: int
    # Audit log settings
    audit_log_rotation_size_mb: int
    audit_log_retention_count: int


# ============================================================================
# Documentation Schemas
# ============================================================================

class DocumentationEntry(BaseModel):
    """Platform documentation entry."""
    id: str
    title: str
    content: str


class DocumentationResponse(BaseModel):
    """List of documentation entries."""
    documents: list[DocumentationEntry]


# ============================================================================
# Quarterly Metric Snapshot Schemas
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
