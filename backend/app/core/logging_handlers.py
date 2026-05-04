from __future__ import annotations

import logging
import logging.handlers
import sys
from collections.abc import Callable
from typing import Any

import structlog


class AuditFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.name == "audit" or record.name.startswith("audit.")


class NonAuditFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.name != "audit" and not record.name.startswith("audit.")


def shared_processors(
    context_processor: Callable[[Any, str, structlog.types.EventDict], structlog.types.EventDict],
) -> list[structlog.types.Processor]:
    return [
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        context_processor,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]


def build_json_formatter(
    processors: list[structlog.types.Processor],
) -> structlog.stdlib.ProcessorFormatter:
    return structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(),
        ],
    )


def build_console_formatter(
    *,
    processors: list[structlog.types.Processor],
    json_console: bool,
) -> structlog.stdlib.ProcessorFormatter:
    return structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer() if not json_console else structlog.processors.JSONRenderer(),
        ],
    )


def build_file_handler(
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


def build_console_handler(
    *,
    formatter: logging.Formatter,
    log_level: str,
) -> logging.StreamHandler:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    handler.setLevel(getattr(logging, log_level))
    return handler
