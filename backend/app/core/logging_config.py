from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ResolvedLoggingConfig:
    log_level: str
    json_console: bool
    app_rotation_size_mb: int
    app_retention_count: int
    audit_rotation_size_mb: int
    audit_retention_count: int

    @property
    def app_size_bytes(self) -> int:
        return self.app_rotation_size_mb * 1024 * 1024

    @property
    def audit_size_bytes(self) -> int:
        return self.audit_rotation_size_mb * 1024 * 1024

    def as_active_config(self) -> dict[str, int | str | bool]:
        return {
            "log_level": self.log_level,
            "json_console": self.json_console,
            "app_rotation_size_mb": self.app_rotation_size_mb,
            "app_retention_count": self.app_retention_count,
            "audit_rotation_size_mb": self.audit_rotation_size_mb,
            "audit_retention_count": self.audit_retention_count,
        }


def resolve_logging_config(
    *,
    log_level: str,
    json_console: bool,
    default_app_size_mb: int,
    default_app_count: int,
    default_audit_size_mb: int,
    default_audit_count: int,
    rotation_size_mb: int | None = None,
    retention_count: int | None = None,
    app_rotation_size_mb: int | None = None,
    app_retention_count: int | None = None,
    audit_rotation_size_mb: int | None = None,
    audit_retention_count: int | None = None,
) -> ResolvedLoggingConfig:
    if rotation_size_mb is not None:
        app_rotation_size_mb = app_rotation_size_mb if app_rotation_size_mb is not None else rotation_size_mb
        audit_rotation_size_mb = audit_rotation_size_mb if audit_rotation_size_mb is not None else rotation_size_mb
    if retention_count is not None:
        app_retention_count = app_retention_count if app_retention_count is not None else retention_count
        audit_retention_count = audit_retention_count if audit_retention_count is not None else retention_count

    return ResolvedLoggingConfig(
        log_level=log_level.upper(),
        json_console=json_console,
        app_rotation_size_mb=app_rotation_size_mb
        if app_rotation_size_mb is not None
        else default_app_size_mb,
        app_retention_count=app_retention_count if app_retention_count is not None else default_app_count,
        audit_rotation_size_mb=audit_rotation_size_mb
        if audit_rotation_size_mb is not None
        else default_audit_size_mb,
        audit_retention_count=audit_retention_count if audit_retention_count is not None else default_audit_count,
    )
