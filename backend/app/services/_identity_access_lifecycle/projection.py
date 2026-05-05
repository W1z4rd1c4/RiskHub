from __future__ import annotations

from typing import Literal

from app.models import User
from app.schemas.directory import DirectoryImportResponse, DirectoryUserRead


def build_directory_import_response(
    *,
    refreshed: User,
    directory_user: DirectoryUserRead,
    import_status: Literal["created", "updated"],
) -> DirectoryImportResponse:
    return DirectoryImportResponse(
        status=import_status,
        user_id=refreshed.id,
        email=refreshed.email,
        name=refreshed.name,
        external_id=refreshed.external_id or directory_user.external_id,
        department_id=refreshed.department_id,
        department_name=refreshed.department.name if refreshed.department else None,
        entra_business_role=refreshed.entra_business_role,
        role_id=refreshed.role_id,
        role_name=refreshed.role.name if refreshed.role else None,
        directory_sync_status=refreshed.directory_sync_status,
    )
