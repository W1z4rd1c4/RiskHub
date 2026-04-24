from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.core.datetime_utils import utc_now
from app.core.permissions import get_user_department_ids
from app.models import User

from ._scoping import _user_has_no_departments, _validate_department_access


@dataclass(frozen=True)
class ReportExportContext:
    current_user: User
    department_id: int | None
    department_ids: list[int] | None
    export_date: date

    @property
    def empty_scope(self) -> bool:
        return _user_has_no_departments(self.department_ids)


def build_report_export_context(
    *,
    current_user: User,
    department_id: int | None = None,
    as_of_date: date | None = None,
) -> ReportExportContext:
    department_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, department_ids)
    return ReportExportContext(
        current_user=current_user,
        department_id=department_id,
        department_ids=department_ids,
        export_date=as_of_date or utc_now().date(),
    )
