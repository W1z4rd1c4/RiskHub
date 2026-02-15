from typing import Optional

from fastapi import HTTPException, status


def _validate_department_access(department_id: Optional[int], dept_ids: Optional[list[int]]) -> None:
    if dept_ids is None:
        return
    if department_id and department_id not in dept_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this department's reports",
        )


def _user_has_no_departments(dept_ids: Optional[list[int]]) -> bool:
    return dept_ids is not None and len(dept_ids) == 0
