from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import structlog

from app.core import logging_config, logging_handlers


def default_active_logging_config(*, log_level: str, json_console: bool, rotation_size_mb: int, retention_count: int):
    return {
        "log_level": log_level,
        "json_console": json_console,
        "app_rotation_size_mb": rotation_size_mb,
        "app_retention_count": retention_count,
        "audit_rotation_size_mb": rotation_size_mb,
        "audit_retention_count": retention_count,
    }


def log_settings(*, rotation_size_mb: int, retention_count: int) -> tuple[int, int, int, int]:
    default_bytes = rotation_size_mb * 1024 * 1024
    return default_bytes, retention_count, default_bytes, retention_count


def configure_logging_runtime(
    *,
    context_processor,
    active_config: dict[str, int | str | bool],
    log_directory: Path,
    default_app_size_mb: int,
    default_app_count: int,
    default_audit_size_mb: int,
    default_audit_count: int,
    log_level: str = "INFO",
    json_console: bool = True,
    rotation_size_mb: int | None = None,
    retention_count: int | None = None,
    app_rotation_size_mb: int | None = None,
    app_retention_count: int | None = None,
    audit_rotation_size_mb: int | None = None,
    audit_retention_count: int | None = None,
) -> structlog.BoundLogger:
    resolved_config = logging_config.resolve_logging_config(
        log_level=log_level,
        json_console=json_console,
        default_app_size_mb=default_app_size_mb,
        default_app_count=default_app_count,
        default_audit_size_mb=default_audit_size_mb,
        default_audit_count=default_audit_count,
        rotation_size_mb=rotation_size_mb,
        retention_count=retention_count,
        app_rotation_size_mb=app_rotation_size_mb,
        app_retention_count=app_retention_count,
        audit_rotation_size_mb=audit_rotation_size_mb,
        audit_retention_count=audit_retention_count,
    )

    log_directory.mkdir(exist_ok=True)
    shared_processors = logging_handlers.shared_processors(context_processor)
    structlog.configure(
        processors=shared_processors + [structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    json_formatter = logging_handlers.build_json_formatter(shared_processors)
    console_formatter = logging_handlers.build_console_formatter(
        processors=shared_processors,
        json_console=resolved_config.json_console,
    )
    handlers = [
        logging_handlers.build_file_handler(
            log_file=str(log_directory / "app.json.log"),
            size_bytes=resolved_config.app_size_bytes,
            backup_count=resolved_config.app_retention_count,
            formatter=json_formatter,
            audit=False,
        ),
        logging_handlers.build_file_handler(
            log_file=str(log_directory / "audit.json.log"),
            size_bytes=resolved_config.audit_size_bytes,
            backup_count=resolved_config.audit_retention_count,
            formatter=json_formatter,
            audit=True,
        ),
        logging_handlers.build_console_handler(
            formatter=console_formatter,
            log_level=resolved_config.log_level,
        ),
    ]
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    for handler in handlers:
        root_logger.addHandler(handler)

    for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
        uvicorn_logger = logging.getLogger(logger_name)
        uvicorn_logger.handlers = []
        uvicorn_logger.propagate = True

    active_config.update(resolved_config.as_active_config())
    return structlog.get_logger("riskhub")


def configure_logging_from_snapshot(*, snapshot: dict[str, int | str | bool], configure) -> structlog.BoundLogger:
    return configure(
        log_level=str(snapshot["log_level"]),
        json_console=bool(snapshot["json_console"]),
        app_rotation_size_mb=int(snapshot["app_rotation_size_mb"]),
        app_retention_count=int(snapshot["app_retention_count"]),
        audit_rotation_size_mb=int(snapshot["audit_rotation_size_mb"]),
        audit_retention_count=int(snapshot["audit_retention_count"]),
    )


def reconfigure_log_rotation_runtime(
    *,
    active_config: dict[str, int | str | bool],
    configure,
    app_rotation_size_mb: int,
    app_retention_count: int,
    audit_rotation_size_mb: int,
    audit_retention_count: int,
) -> structlog.BoundLogger:
    next_config = dict(active_config)
    next_config.update(
        {
            "app_rotation_size_mb": app_rotation_size_mb,
            "app_retention_count": app_retention_count,
            "audit_rotation_size_mb": audit_rotation_size_mb,
            "audit_retention_count": audit_retention_count,
        }
    )
    return configure_logging_from_snapshot(snapshot=next_config, configure=configure)


def tail_log_file_runtime(log_path: Path, line_count: int = 100) -> tuple[list[str], int]:
    if not log_path.exists():
        return [], 0

    lines: list[str] = []
    file_size = log_path.stat().st_size
    if file_size == 0:
        return [], 0

    chunk_size = 8192
    buffer = ""
    with open(log_path, "rb") as handle:
        remaining = file_size
        while remaining > 0 and len(lines) < line_count:
            read_size = min(chunk_size, remaining)
            remaining -= read_size
            handle.seek(remaining)
            chunk = handle.read(read_size).decode("utf-8", errors="replace")
            buffer = chunk + buffer
            while "\n" in buffer and len(lines) < line_count:
                last_newline = buffer.rfind("\n")
                if last_newline == len(buffer) - 1:
                    prev_newline = buffer.rfind("\n", 0, last_newline)
                    if prev_newline < 0:
                        break
                    line = buffer[prev_newline + 1 : last_newline]
                    buffer = buffer[: prev_newline + 1]
                else:
                    line = buffer[last_newline + 1 :]
                    buffer = buffer[: last_newline + 1]
                if line.strip():
                    lines.append(line)

    if buffer.strip() and len(lines) < line_count:
        for line in buffer.strip().split("\n"):
            if line.strip() and len(lines) < line_count:
                lines.append(line)

    lines.reverse()
    avg_line_size = file_size / max(len(lines), 1) if lines else 100
    total_estimate = int(file_size / avg_line_size) if avg_line_size > 0 else 0
    return lines[-line_count:], total_estimate


@dataclass(frozen=True)
class LoggingRuntimeCommand:
    name: str
