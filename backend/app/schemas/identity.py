"""Nonsecret profile and identity-action projections."""

from typing import Literal

from pydantic import BaseModel


class IdentityConfig(BaseModel):
    mode: Literal["native", "entra", "development"]
    external_directory: Literal["enabled", "disabled"]
    local_enrollment_enabled: bool
    password_reset_enabled: bool
    factor_management_enabled: bool
    recovery_method: Literal["governed_local", "identity_provider", "unsupported"]


class CurrentIdentityCapabilities(BaseModel):
    can_invite_users: bool = False
    can_manage_own_credentials: bool = False
    can_import_directory_users: bool = False
    can_check_directory_users: bool = False


class IdentityBindingRead(BaseModel):
    installation_id: str
    auth_mode: Literal["password", "microsoft_sso"]
    tenant_id: str | None
    contract_version: int
