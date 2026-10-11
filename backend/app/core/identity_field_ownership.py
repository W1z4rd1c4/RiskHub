"""Account field owners, independent of reader authority and edit availability."""

from __future__ import annotations

from typing import Literal

from app.core.config import Settings
from app.core.local_session import native_identity_selected
from app.models.user import User

FieldOwner = Literal["directory", "credential_workflow", "administrator"]
DIRECTORY_FIELDS = frozenset({"name", "email", "job_title", "entra_business_role", "external_id"})
IDENTITY_FIELDS = DIRECTORY_FIELDS


def identity_field_owners(*, settings: Settings | None, user: User) -> dict[str, FieldOwner]:
    """Classify known identity fields; permission and allowed write surfaces stay separate.

    A missing settings value supports existing non-request capability callers only.
    Mutation callers supply the deployment explicitly. Password mutation and
    authentication availability are separate existing credential-workflow policies.
    """
    owners: dict[str, FieldOwner] = {field: "administrator" for field in IDENTITY_FIELDS}
    if settings is not None and settings.auth_mode == "microsoft_sso" and user.external_id:
        owners.update({field: "directory" for field in DIRECTORY_FIELDS})
    if settings is not None and native_identity_selected(settings):
        owners["email"] = "credential_workflow"
    return owners
