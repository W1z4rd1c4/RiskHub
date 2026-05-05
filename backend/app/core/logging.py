"""
Structured JSON logging configuration for SIEM integration.

This module configures structlog to output JSON-formatted logs with:
- ISO timestamps
- Log level
- Request context (request_id, user_id, client_ip)
- Compatibility with standard Python logging (uvicorn, sqlalchemy)

Log files:
- logs/app.json.log: General application logs
- logs/audit.json.log: Audit/security events only (for SIEM)
"""

import os
from contextvars import ContextVar
from functools import partial
from pathlib import Path
from typing import Any

import structlog

from app.core import logging_config as logging_config
from app.core import logging_handlers as logging_handlers
from app.core import logging_runtime as logging_runtime

# Context variables for request tracking
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_ctx: ContextVar[int | None] = ContextVar("user_id", default=None)
client_ip_ctx: ContextVar[str | None] = ContextVar("client_ip", default=None)

# Default log rotation settings.
DEFAULT_LOG_ROTATION_SIZE_MB = 10
DEFAULT_LOG_RETENTION_COUNT = 10
_DEFAULT_JSON_CONSOLE = os.getenv("DEBUG", "false").lower() != "true"
_DEFAULT_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
_active_logging_config: dict[str, int | str | bool] = {
    "log_level": _DEFAULT_LOG_LEVEL,
    "json_console": _DEFAULT_JSON_CONSOLE,
    "app_rotation_size_mb": DEFAULT_LOG_ROTATION_SIZE_MB,
    "app_retention_count": DEFAULT_LOG_RETENTION_COUNT,
    "audit_rotation_size_mb": DEFAULT_LOG_ROTATION_SIZE_MB,
    "audit_retention_count": DEFAULT_LOG_RETENTION_COUNT,
}

ResolvedLoggingConfig = logging_config.ResolvedLoggingConfig
AuditFilter = logging_handlers.AuditFilter
NonAuditFilter = logging_handlers.NonAuditFilter
_resolve_logging_config = partial(
    logging_config.resolve_logging_config,
    default_app_size_mb=DEFAULT_LOG_ROTATION_SIZE_MB,
    default_app_count=DEFAULT_LOG_RETENTION_COUNT,
    default_audit_size_mb=DEFAULT_LOG_ROTATION_SIZE_MB,
    default_audit_count=DEFAULT_LOG_RETENTION_COUNT,
)


def add_context_vars(
    logger: Any,
    method_name: str,
    event_dict: structlog.types.EventDict,
) -> structlog.types.EventDict:
    """Processor to add context variables to log entries."""
    if (request_id := request_id_ctx.get()) is not None:
        event_dict["request_id"] = request_id
    if (user_id := user_id_ctx.get()) is not None:
        event_dict["user_id"] = user_id
    if (client_ip := client_ip_ctx.get()) is not None:
        event_dict["client_ip"] = client_ip
    return event_dict


def get_log_settings() -> tuple[int, int, int, int]:
    """
    Get default log rotation settings.

    Returns:
        Tuple of (app_size_bytes, app_count, audit_size_bytes, audit_count)
    """
    return logging_runtime.log_settings(
        rotation_size_mb=DEFAULT_LOG_ROTATION_SIZE_MB,
        retention_count=DEFAULT_LOG_RETENTION_COUNT,
    )


def get_active_logging_config() -> dict[str, int | str | bool]:
    return dict(_active_logging_config)


def configure_logging_from_snapshot(snapshot: dict[str, int | str | bool]) -> structlog.BoundLogger:
    return logging_runtime.configure_logging_from_snapshot(snapshot=snapshot, configure=configure_logging)


def configure_logging(
    log_level: str = "INFO",
    json_console: bool = True,
    # Backward-compatible aliases (apply to both app + audit when set)
    rotation_size_mb: int | None = None,
    retention_count: int | None = None,
    app_rotation_size_mb: int | None = None,
    app_retention_count: int | None = None,
    audit_rotation_size_mb: int | None = None,
    audit_retention_count: int | None = None,
) -> structlog.BoundLogger:
    """
    Configure structlog with JSON rendering and dual file output.

    Args:
        log_level: Minimum log level (DEBUG, INFO, WARNING, ERROR)
        json_console: Whether to render JSON to console (True for prod)
        app_rotation_size_mb: Max size per app log file in MB (default from config)
        app_retention_count: Number of app backup files to keep (default from config)
        audit_rotation_size_mb: Max size per audit log file in MB (default from config)
        audit_retention_count: Number of audit backup files to keep (default from config)

    Returns:
        Configured structlog logger
    """
    return logging_runtime.configure_logging_runtime(
        context_processor=add_context_vars,
        active_config=_active_logging_config,
        log_directory=get_log_directory(),
        default_app_size_mb=DEFAULT_LOG_ROTATION_SIZE_MB,
        default_app_count=DEFAULT_LOG_RETENTION_COUNT,
        default_audit_size_mb=DEFAULT_LOG_ROTATION_SIZE_MB,
        default_audit_count=DEFAULT_LOG_RETENTION_COUNT,
        log_level=log_level,
        json_console=json_console,
        rotation_size_mb=rotation_size_mb,
        retention_count=retention_count,
        app_rotation_size_mb=app_rotation_size_mb,
        app_retention_count=app_retention_count,
        audit_rotation_size_mb=audit_rotation_size_mb,
        audit_retention_count=audit_retention_count,
    )


def reconfigure_log_rotation(
    *,
    app_rotation_size_mb: int,
    app_retention_count: int,
    audit_rotation_size_mb: int,
    audit_retention_count: int,
) -> structlog.BoundLogger:
    return logging_runtime.reconfigure_log_rotation_runtime(
        active_config=get_active_logging_config(),
        configure=configure_logging,
        app_rotation_size_mb=app_rotation_size_mb,
        app_retention_count=app_retention_count,
        audit_rotation_size_mb=audit_rotation_size_mb,
        audit_retention_count=audit_retention_count,
    )


def get_log_directory() -> Path:
    """
    Get the log directory path used by configure_logging().

    This is the single source of truth for log file locations.
    Returns:
        Path to the logs directory (backend/logs/)
    """
    return Path(__file__).parent.parent.parent / "logs"


# Module-level logger for import convenience
logger = configure_logging(
    log_level=_DEFAULT_LOG_LEVEL,
    json_console=_DEFAULT_JSON_CONSOLE,
)


def get_logger(name: str = "riskhub") -> structlog.BoundLogger:
    """Get a named structlog logger."""
    return structlog.get_logger(name)


def get_audit_logger() -> structlog.BoundLogger:
    """Get the dedicated audit logger for security events."""
    return structlog.get_logger("audit")


def tail_log_file(log_path: Path, line_count: int = 100) -> tuple[list[str], int]:
    """
    Efficiently read the last N lines from a log file.

    Uses reverse reading to avoid scanning the entire file.

    Args:
        log_path: Path to the log file
        line_count: Number of lines to retrieve

    Returns:
        Tuple of (list of lines, total line count estimate)
    """
    return logging_runtime.tail_log_file_runtime(log_path, line_count)
