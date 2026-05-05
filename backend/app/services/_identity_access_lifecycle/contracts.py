from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.models import User
from app.models.user import AccessScope
from app.schemas.directory import DirectoryImportResponse


@dataclass(frozen=True)
class IdentityImportOutcome:
    status: Literal["created", "updated", "conflict", "skipped", "directory_disabled"]
    user: User | None
    response: DirectoryImportResponse | None = None
    reason: str | None = None


@dataclass(frozen=True)
class AccessProfileUpdateOutcome:
    status: Literal["applied", "blocked", "orphan_flagged", "break_glass_required"]
    user: User
    reason: str | None = None
    orphaned_items_flagged: int = 0


@dataclass(frozen=True)
class AccessScopePlan:
    role_id: int | None
    access_scope: AccessScope | None
    is_platform_admin_visible: bool
    changes: dict
