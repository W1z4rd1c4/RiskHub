"""
Structured JSON logging configuration for SIEM integration.

This module configures structlog to output JSON-formatted logs with:
- ISO timestamps
- Log level
- Request context (request_id, user_id, client_ip)
- Compatibility with standard Python logging (uvicorn, sqlalchemy)

Log files are written to logs/app.json.log for SIEM agent consumption.
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


def configure_logging(
    log_level: str = "INFO",
    log_file: str | None = None,
    json_console: bool = True,
) -> structlog.BoundLogger:
    """
    Configure structlog with JSON rendering and file output.
    
    Args:
        log_level: Minimum log level (DEBUG, INFO, WARNING, ERROR)
        log_file: Path to JSON log file (default: logs/app.json.log)
        json_console: Whether to render JSON to console (True for prod)
    
    Returns:
        Configured structlog logger
    """
    # Ensure logs directory exists
    if log_file is None:
        log_dir = Path(__file__).parent.parent.parent / "logs"
        log_dir.mkdir(exist_ok=True)
        log_file = str(log_dir / "app.json.log")
    else:
        Path(log_file).parent.mkdir(parents=True, exist_ok=True)
    
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
    
    # Configure standard library logging (for uvicorn, sqlalchemy, etc.)
    json_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(),
        ],
    )
    
    console_formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer() if not json_console else structlog.processors.JSONRenderer(),
        ],
    )
    
    # File handler with rotation
    file_handler = logging.handlers.RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(json_formatter)
    file_handler.setLevel(logging.DEBUG)  # Capture all levels to file
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(console_formatter)
    console_handler.setLevel(getattr(logging, log_level.upper()))
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)  # Set low to let handlers filter
    
    # Remove existing handlers to avoid duplicates on reload
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    root_logger.addHandler(file_handler)
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
