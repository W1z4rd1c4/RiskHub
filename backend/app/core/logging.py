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
from pathlib import Path
from typing import Any

import structlog


# Context variables for request tracking
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_ctx: ContextVar[int | None] = ContextVar("user_id", default=None)
client_ip_ctx: ContextVar[str | None] = ContextVar("client_ip", default=None)

# Default log rotation settings (can be overridden from Risk Hub config)
DEFAULT_LOG_ROTATION_SIZE_MB = 10
DEFAULT_LOG_RETENTION_COUNT = 10


def add_context_vars(
    logger: logging.Logger, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
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


def get_log_settings() -> tuple[int, int]:
    """
    Get log rotation settings from Risk Hub config or defaults.
    
    Returns:
        Tuple of (rotation_size_bytes, retention_count)
    """
    # Try to read from config cache synchronously
    try:
        from app.models.global_config import get_config_sync
        size_mb = get_config_sync("log_rotation_size_mb", DEFAULT_LOG_ROTATION_SIZE_MB)
        count = get_config_sync("log_retention_count", DEFAULT_LOG_RETENTION_COUNT)
        return (int(size_mb) * 1024 * 1024, int(count))
    except Exception:
        # Fallback to defaults if config not available
        return (DEFAULT_LOG_ROTATION_SIZE_MB * 1024 * 1024, DEFAULT_LOG_RETENTION_COUNT)


def configure_logging(
    log_level: str = "INFO",
    json_console: bool = True,
    rotation_size_mb: int | None = None,
    retention_count: int | None = None,
) -> structlog.BoundLogger:
    """
    Configure structlog with JSON rendering and dual file output.
    
    Args:
        log_level: Minimum log level (DEBUG, INFO, WARNING, ERROR)
        json_console: Whether to render JSON to console (True for prod)
        rotation_size_mb: Max size per log file in MB (default from config)
        retention_count: Number of backup files to keep (default from config)
    
    Returns:
        Configured structlog logger
    """
    # Ensure logs directory exists
    log_dir = Path(__file__).parent.parent.parent / "logs"
    log_dir.mkdir(exist_ok=True)
    
    app_log_file = str(log_dir / "app.json.log")
    audit_log_file = str(log_dir / "audit.json.log")
    
    # Get rotation settings
    if rotation_size_mb is None or retention_count is None:
        default_size, default_count = get_log_settings()
        rotation_size_bytes = (rotation_size_mb * 1024 * 1024) if rotation_size_mb else default_size
        backup_count = retention_count if retention_count else default_count
    else:
        rotation_size_bytes = rotation_size_mb * 1024 * 1024
        backup_count = retention_count
    
    # Shared processors for both structlog and stdlib logging
    shared_processors: list[structlog.types.Processor] = [
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        add_context_vars,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]
    
    # Configure structlog
    structlog.configure(
        processors=shared_processors + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    
    # JSON formatter for file handlers
    json_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(),
        ],
    )
    
    # Console formatter (JSON or pretty based on env)
    console_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer() if not json_console else structlog.processors.JSONRenderer(),
        ],
    )
    
    # App file handler - general logs (excludes audit)
    app_handler = logging.handlers.RotatingFileHandler(
        app_log_file,
        maxBytes=rotation_size_bytes,
        backupCount=backup_count,
        encoding="utf-8",
    )
    app_handler.setFormatter(json_formatter)
    app_handler.setLevel(logging.DEBUG)
    app_handler.addFilter(NonAuditFilter())  # Exclude audit events
    
    # Audit file handler - security/audit events only
    audit_handler = logging.handlers.RotatingFileHandler(
        audit_log_file,
        maxBytes=rotation_size_bytes,
        backupCount=backup_count,
        encoding="utf-8",
    )
    audit_handler.setFormatter(json_formatter)
    audit_handler.setLevel(logging.DEBUG)
    audit_handler.addFilter(AuditFilter())  # Only audit events
    
    # Console handler (all logs)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(console_formatter)
    console_handler.setLevel(getattr(logging, log_level.upper()))
    
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
    
    # Get a structlog logger to return
    return structlog.get_logger("riskhub")


# Module-level logger for import convenience
logger = configure_logging(
    log_level=os.getenv("LOG_LEVEL", "INFO"),
    json_console=os.getenv("DEBUG", "false").lower() != "true",
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
                        line = buffer[prev_newline + 1:last_newline]
                        buffer = buffer[:prev_newline + 1]
                        if line.strip():
                            lines.append(line)
                    else:
                        # Only one line in buffer, need more data
                        break
                else:
                    # Buffer doesn't end with newline, split at last
                    line = buffer[last_newline + 1:]
                    buffer = buffer[:last_newline + 1]
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
