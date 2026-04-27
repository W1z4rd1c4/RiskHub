from datetime import date
from typing import Literal

from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.issue import IssueSeverity, IssueStatus

from ._shared import ExportFormat, _as_of_datetime
from .fetch import _fetch_issues_for_export
from .render import _render_export
from .rows import _issue_to_row


async def _export_issues(
    *,
    db: AsyncSession,
    current_user: User,
    export_format: ExportFormat,
    as_of_date: date,
    department_id: int | None,
    status_filter: IssueStatus | None,
    severity_filter: IssueSeverity | None,
    severity_group: Literal["high_critical"] | None,
    owner_user_id: int | None,
    overdue_only: bool,
    exclude_active_exceptions: bool,
) -> StreamingResponse:
    models = await _fetch_issues_for_export(
        db,
        current_user=current_user,
        department_id=department_id,
        status_filter=status_filter,
        severity_filter=severity_filter,
        severity_group=severity_group,
        owner_user_id=owner_user_id,
        exclude_active_exceptions=exclude_active_exceptions,
    )
    as_of_dt = _as_of_datetime(as_of_date)
    rows = [_issue_to_row(issue, as_of_dt=as_of_dt, current_user=current_user) for issue in models]
    if overdue_only:
        rows = [row for row in rows if bool(row.get("is_overdue"))]

    headers = [
        "Issue ID",
        "Title",
        "Status",
        "Severity",
        "Source Type",
        "Source ID",
        "Source Display",
        "Source Link Type",
        "Source Link Label",
        "Department",
        "Owner",
        "Due At",
        "Overdue",
        "Age (days)",
        "Linked Risk IDs",
        "Linked Risks",
        "Linked Control IDs",
        "Linked Controls",
        "Linked Execution IDs",
        "Linked KRI IDs",
        "Linked KRIs",
        "Remediation Status",
        "Remediation Progress",
        "Remediation Owner",
        "Remediation Target Date",
        "Exception Status",
        "Exception Expires At",
    ]
    data_rows = [
        [
            row.get("id"),
            row.get("title"),
            row.get("status"),
            row.get("severity"),
            row.get("source_type"),
            row.get("source_id"),
            row.get("source_display"),
            row.get("source_link_type"),
            row.get("source_link_label"),
            row.get("department_name"),
            row.get("owner_name"),
            row.get("due_at"),
            "yes" if row.get("is_overdue") else "no",
            row.get("age_days"),
            row.get("risk_ids"),
            row.get("risk_names"),
            row.get("control_ids"),
            row.get("control_names"),
            row.get("execution_ids"),
            row.get("kri_ids"),
            row.get("kri_names"),
            row.get("remediation_status"),
            row.get("remediation_progress_percent"),
            row.get("remediation_owner_name"),
            row.get("remediation_target_date"),
            row.get("exception_status"),
            row.get("exception_expires_at"),
        ]
        for row in rows
    ]

    return _render_export(
        title=f"Issue Export (as of {as_of_date.isoformat()})",
        sheet_name="Issues",
        filename_base="issues",
        export_format=export_format,
        headers=headers,
        data_rows=data_rows,
        as_of_date=as_of_date,
    )
