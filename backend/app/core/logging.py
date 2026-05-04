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

import logging
import logging.handlers
import os
import sys
from contextvars import ContextVar
from dataclasses import dataclass
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


class AuditFilter(logging.Filter):
    """Filter to include ONLY audit logger events."""

    def filter(self, record: logging.LogRecord) -> bool:
        return record.name == "audit" or record.name.startswith("audit.")


class NonAuditFilter(logging.Filter):
    """Filter to EXCLUDE audit logger events (for app log)."""

    def filter(self, record: logging.LogRecord) -> bool:
        return record.name != "audit" and not record.name.startswith("audit.")


def get_log_settings() -> tuple[int, int, int, int]:
    """
    Get default log rotation settings.

    Returns:
        Tuple of (app_size_bytes, app_count, audit_size_bytes, audit_count)
    """
    default_bytes = DEFAULT_LOG_ROTATION_SIZE_MB * 1024 * 1024
    return (
        default_bytes,
        DEFAULT_LOG_RETENTION_COUNT,
        default_bytes,
        DEFAULT_LOG_RETENTION_COUNT,
    )


def get_active_logging_config() -> dict[str, int | str | bool]:
    return dict(_active_logging_config)


def _resolve_logging_config(
    *,
    log_level: str,
    json_console: bool,
    rotation_size_mb: int | None = None,
    retention_count: int | None = None,
    app_rotation_size_mb: int | None = None,
    app_retention_count: int | None = None,
    audit_rotation_size_mb: int | None = None,
    audit_retention_count: int | None = None,
) -> ResolvedLoggingConfig:
    default_app_size, default_app_count, default_audit_size, default_audit_count = get_log_settings()

    if rotation_size_mb is not None:
        if app_rotation_size_mb is None:
            app_rotation_size_mb = rotation_size_mb
        if audit_rotation_size_mb is None:
            audit_rotation_size_mb = rotation_size_mb
    if retention_count is not None:
        if app_retention_count is None:
            app_retention_count = retention_count
        if audit_retention_count is None:
            audit_retention_count = retention_count

    return ResolvedLoggingConfig(
        log_level=log_level.upper(),
        json_console=json_console,
        app_rotation_size_mb=app_rotation_size_mb
        if app_rotation_size_mb is not None
        else default_app_size // (1024 * 1024),
        app_retention_count=app_retention_count if app_retention_count is not None else default_app_count,
        audit_rotation_size_mb=audit_rotation_size_mb
        if audit_rotation_size_mb is not None
        else default_audit_size // (1024 * 1024),
        audit_retention_count=audit_retention_count if audit_retention_count is not None else default_audit_count,
    )


def _shared_processors() -> list[structlog.types.Processor]:
    return [
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        add_context_vars,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]


def _build_json_formatter(
    shared_processors: list[structlog.types.Processor],
) -> structlog.stdlib.ProcessorFormatter:
    return structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(),
        ],
    )


def _build_console_formatter(
    *,
    shared_processors: list[structlog.types.Processor],
    json_console: bool,
) -> structlog.stdlib.ProcessorFormatter:
    return structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer() if not json_console else structlog.processors.JSONRenderer(),
        ],
    )


def _build_file_handler(
    *,
    log_file: str,
    size_bytes: int,
    backup_count: int,
    formatter: logging.Formatter,
    audit: bool,
) -> logging.handlers.RotatingFileHandler:
    handler = logging.handlers.RotatingFileHandler(
        log_file,
        maxBytes=size_bytes,
        backupCount=backup_count,
        encoding="utf-8",
    )
    handler.setFormatter(formatter)
    handler.setLevel(logging.DEBUG)
    handler.addFilter(AuditFilter() if audit else NonAuditFilter())
    return handler


def _build_console_handler(
    *,
    formatter: logging.Formatter,
    log_level: str,
) -> logging.StreamHandler:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    handler.setLevel(getattr(logging, log_level))
    return handler


def configure_logging_from_snapshot(snapshot: dict[str, int | str | bool]) -> structlog.BoundLogger:
    return configure_logging(
        log_level=str(snapshot["log_level"]),
        json_console=bool(snapshot["json_console"]),
        app_rotation_size_mb=int(snapshot["app_rotation_size_mb"]),
        app_retention_count=int(snapshot["app_retention_count"]),
        audit_rotation_size_mb=int(snapshot["audit_rotation_size_mb"]),
        audit_retention_count=int(snapshot["audit_retention_count"]),
    )


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
    resolved_config = _resolve_logging_config(
        log_level=log_level,
        json_console=json_console,
        rotation_size_mb=rotation_size_mb,
        retention_count=retention_count,
        app_rotation_size_mb=app_rotation_size_mb,
        app_retention_count=app_retention_count,
        audit_rotation_size_mb=audit_rotation_size_mb,
        audit_retention_count=audit_retention_count,
    )

    # Ensure logs directory exists
    log_dir = Path(__file__).parent.parent.parent / "logs"
    log_dir.mkdir(exist_ok=True)

    app_log_file = str(log_dir / "app.json.log")
    audit_log_file = str(log_dir / "audit.json.log")

    # Shared processors for both structlog and stdlib logging
    shared_processors = _shared_processors()

    # Configure structlog
    structlog.configure(
        processors=shared_processors
        + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # JSON formatter for file handlers
    json_formatter = _build_json_formatter(shared_processors)

    # Console formatter (JSON or pretty based on env)
    console_formatter = _build_console_formatter(
        shared_processors=shared_processors,
        json_console=resolved_config.json_console,
    )

    # App file handler - general logs (excludes audit)
    app_handler = _build_file_handler(
        log_file=app_log_file,
        size_bytes=resolved_config.app_size_bytes,
        backup_count=resolved_config.app_retention_count,
        formatter=json_formatter,
        audit=False,
    )

    # Audit file handler - security/audit events only
    audit_handler = _build_file_handler(
        log_file=audit_log_file,
        size_bytes=resolved_config.audit_size_bytes,
        backup_count=resolved_config.audit_retention_count,
        formatter=json_formatter,
        audit=True,
    )

    # Console handler (all logs)
    console_handler = _build_console_handler(
        formatter=console_formatter,
        log_level=resolved_config.log_level,
    )

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)

    # Remove existing handlers to avoid duplicates on reload
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    root_logger.addHandler(app_handler)
    root_logger.addHandler(audit_handler)
    root_logger.addHandler(console_handler)

    # Adjust uvicorn loggers to use same format
    for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
        uvicorn_logger = logging.getLogger(logger_name)
        uvicorn_logger.handlers = []
        uvicorn_logger.propagate = True

    _active_logging_config.update(resolved_config.as_active_config())

    # Get a structlog logger to return
    return structlog.get_logger("riskhub")


def reconfigure_log_rotation(
    *,
    app_rotation_size_mb: int,
    app_retention_count: int,
    audit_rotation_size_mb: int,
    audit_retention_count: int,
) -> structlog.BoundLogger:
    active_config = get_active_logging_config()
    active_config.update(
        {
            "app_rotation_size_mb": app_rotation_size_mb,
            "app_retention_count": app_retention_count,
            "audit_rotation_size_mb": audit_rotation_size_mb,
            "audit_retention_count": audit_retention_count,
        }
    )
    return configure_logging_from_snapshot(active_config)


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


def get_log_directory() -> Path:
    """
    Get the log directory path used by configure_logging().

    This is the single source of truth for log file locations.
    Returns:
        Path to the logs directory (backend/logs/)
    """
    return Path(__file__).parent.parent.parent / "logs"


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
    if not log_path.exists():
        return [], 0

    lines: list[str] = []
    file_size = log_path.stat().st_size

    if file_size == 0:
        return [], 0

    # Read in chunks from the end
    chunk_size = 8192
    buffer = ""

    with open(log_path, "rb") as f:
        # Start from end
        remaining = file_size

        while remaining > 0 and len(lines) < line_count:
            # Read chunk
            read_size = min(chunk_size, remaining)
            remaining -= read_size
            f.seek(remaining)
            chunk = f.read(read_size).decode("utf-8", errors="replace")

            buffer = chunk + buffer

            # Extract complete lines
            while "\n" in buffer and len(lines) < line_count:
                last_newline = buffer.rfind("\n")
                if last_newline == len(buffer) - 1:
                    # Line ends with newline, find the previous one
                    prev_newline = buffer.rfind("\n", 0, last_newline)
                    if prev_newline >= 0:
                        line = buffer[prev_newline + 1 : last_newline]
                        buffer = buffer[: prev_newline + 1]
                        if line.strip():
                            lines.append(line)
                    else:
                        # Only one line in buffer, need more data
                        break
                else:
                    # Buffer doesn't end with newline, split at last
                    line = buffer[last_newline + 1 :]
                    buffer = buffer[: last_newline + 1]
                    if line.strip():
                        lines.append(line)

    # Add any remaining content
    if buffer.strip() and len(lines) < line_count:
        for line in buffer.strip().split("\n"):
            if line.strip() and len(lines) < line_count:
                lines.append(line)

    # Reverse to get chronological order (oldest first)
    lines.reverse()

    # Estimate total lines (rough approximation)
    avg_line_size = file_size / max(len(lines), 1) if lines else 100
    total_estimate = int(file_size / avg_line_size) if avg_line_size > 0 else 0

    return lines[-line_count:], total_estimate
