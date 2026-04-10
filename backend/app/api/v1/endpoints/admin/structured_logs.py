from __future__ import annotations

from fastapi import APIRouter, Depends

from app.models import User
from app.schemas.admin import RecentLogEntry, RecentLogsResponse

from ._deps import require_platform_admin

router = APIRouter()

# Known fields in structured log entries
_LOG_KNOWN_FIELDS = {
    "timestamp",
    "level",
    "event",
    "logger",
    "request_id",
    "user_id",
    "client_ip",
    "feature",
}


def _parse_log_entry(data: dict) -> RecentLogEntry:
    """Parse a JSON log entry dict into a RecentLogEntry schema."""
    extra = {k: v for k, v in data.items() if k not in _LOG_KNOWN_FIELDS}
    return RecentLogEntry(
        timestamp=data.get("timestamp"),
        level=data.get("level", "").upper(),
        event=data.get("event"),
        logger_name=data.get("logger"),
        request_id=data.get("request_id"),
        user_id=data.get("user_id"),
        client_ip=data.get("client_ip"),
        feature=data.get("feature"),
        extra=extra,
    )


def _read_log_file(
    log_filename: str,
    max_lines: int,
    filter_key: str | None = None,
    filter_value: str | None = None,
) -> RecentLogsResponse:
    """
    Read and parse a JSON log file with optional filtering.

    Args:
        log_filename: Name of log file in log directory (e.g., "app.json.log")
        max_lines: Maximum number of entries to return
        filter_key: Optional key to filter on ("level" or "event")
        filter_value: Value to match for filter_key
    """
    import json

    from app.core.logging import get_log_directory, tail_log_file

    log_file = get_log_directory() / log_filename

    if not log_file.exists():
        return RecentLogsResponse(entries=[], total_lines=0, file_path=str(log_file))

    # Read extra lines for filtering
    recent_lines, total_estimate = tail_log_file(log_file, max_lines * 2)

    entries: list[RecentLogEntry] = []
    for line in recent_lines:
        if not line:
            continue
        try:
            data = json.loads(line)

            # Apply filter if specified
            if filter_key and filter_value:
                actual_value = data.get(filter_key, "")
                if filter_key == "level":
                    actual_value = actual_value.upper()
                if actual_value != filter_value:
                    continue

            entries.append(_parse_log_entry(data))
        except json.JSONDecodeError:
            continue

    return RecentLogsResponse(entries=entries[-max_lines:], total_lines=total_estimate, file_path=str(log_file))


@router.get("/logs/recent", response_model=RecentLogsResponse)
async def get_recent_logs(
    admin_user: User = Depends(require_platform_admin),
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
    return _read_log_file(
        log_filename="app.json.log",
        max_lines=min(lines, 500),
        filter_key="level" if level else None,
        filter_value=level.upper() if level else None,
    )


@router.get("/logs/audit", response_model=RecentLogsResponse)
async def get_audit_logs(
    admin_user: User = Depends(require_platform_admin),
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
    return _read_log_file(
        log_filename="audit.json.log",
        max_lines=min(lines, 1000),
        filter_key="event" if event_type else None,
        filter_value=event_type,
    )
