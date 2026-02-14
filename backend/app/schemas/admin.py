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
from pydantic import BaseModel, Field, model_validator

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
    app_log_rotation_size_mb: int = Field(ge=1, le=500)
    app_log_retention_count: int = Field(ge=1, le=500)
    # Audit log settings
    audit_log_rotation_size_mb: int = Field(ge=1, le=500)
    audit_log_retention_count: int = Field(ge=1, le=500)


class LogConfigUpdate(BaseModel):
    """
    Log rotation update payload with compatibility for legacy 2-field clients.

    Accepted shapes:
    - Canonical (4 fields): app_* + audit_*
    - Legacy (2 fields): log_rotation_size_mb + log_retention_count

    Mixed canonical+legacy payloads are rejected.
    """

    # Canonical fields
    app_log_rotation_size_mb: int | None = Field(default=None, ge=1, le=500)
    app_log_retention_count: int | None = Field(default=None, ge=1, le=500)
    audit_log_rotation_size_mb: int | None = Field(default=None, ge=1, le=500)
    audit_log_retention_count: int | None = Field(default=None, ge=1, le=500)

    # Legacy compatibility fields
    log_rotation_size_mb: int | None = Field(default=None, ge=1, le=500)
    log_retention_count: int | None = Field(default=None, ge=1, le=500)

    @model_validator(mode="after")
    def validate_shape(self) -> "LogConfigUpdate":
        canonical_values = (
            self.app_log_rotation_size_mb,
            self.app_log_retention_count,
            self.audit_log_rotation_size_mb,
            self.audit_log_retention_count,
        )
        legacy_values = (self.log_rotation_size_mb, self.log_retention_count)

        has_canonical = any(value is not None for value in canonical_values)
        has_legacy = any(value is not None for value in legacy_values)

        if has_canonical and has_legacy:
            raise ValueError(
                "Provide either canonical app/audit fields or legacy log_* fields, not both"
            )
        if not has_canonical and not has_legacy:
            raise ValueError(
                "Missing log config fields: provide canonical app/audit fields or legacy log_* fields"
            )
        if has_canonical and any(value is None for value in canonical_values):
            raise ValueError(
                "Canonical payload must include all 4 fields: app_* and audit_*"
            )
        if has_legacy and any(value is None for value in legacy_values):
            raise ValueError(
                "Legacy payload must include both fields: log_rotation_size_mb and log_retention_count"
            )

        return self

    def to_log_config(self) -> LogConfig:
        """Normalize canonical or legacy payload into canonical app/audit shape."""
        if self.log_rotation_size_mb is not None:
            return LogConfig(
                app_log_rotation_size_mb=self.log_rotation_size_mb,
                app_log_retention_count=self.log_retention_count,  # validated non-None
                audit_log_rotation_size_mb=self.log_rotation_size_mb,
                audit_log_retention_count=self.log_retention_count,  # validated non-None
            )

        return LogConfig(
            app_log_rotation_size_mb=self.app_log_rotation_size_mb,  # validated non-None
            app_log_retention_count=self.app_log_retention_count,  # validated non-None
            audit_log_rotation_size_mb=self.audit_log_rotation_size_mb,  # validated non-None
            audit_log_retention_count=self.audit_log_retention_count,  # validated non-None
        )


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
