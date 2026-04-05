from __future__ import annotations

from datetime import timedelta
from typing import Literal

from pydantic import BaseModel, Field


class DirectoryUserRead(BaseModel):
    """Normalized directory user record returned by provider adapters."""

    external_id: str = Field(..., description="Directory object ID (OID)")
    display_name: str
    email: str | None = None
    user_principal_name: str | None = None
    department: str | None = None
    job_title: str | None = None
    business_role: str | None = None
    account_enabled: bool = True
    source: Literal["graph", "ad_emulator"]


class DirectoryImportRequest(BaseModel):
    """Optional overrides when importing a directory user."""

    role_id: int | None = None


class DirectoryImportResponse(BaseModel):
    """Result payload for directory import operations."""

    status: Literal["created", "updated"]
    user_id: int
    email: str
    name: str
    external_id: str
    department_id: int | None = None
    department_name: str | None = None
    entra_business_role: str | None = None
    role_id: int
    role_name: str | None = None
    directory_sync_status: str | None = None


class DirectoryBreakGlassEnableRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=255)
    expires_in_hours: int = Field(..., ge=1, le=24)

    @property
    def expires_delta(self) -> timedelta:
        return timedelta(hours=self.expires_in_hours)
