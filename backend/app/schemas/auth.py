"""Pydantic schemas for authentication."""
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.user import UserBrief


class LoginRequest(BaseModel):
    """Schema for login request."""
    email: str  # Changed from EmailStr to allow .test TLD for testing
    password: str


class DemoLoginRequest(BaseModel):
    """Schema for dev-only demo login request."""
    email: str


class TokenResponse(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    token_type: str = "bearer"
    user: UserBrief  # Use specific schema instead of dict


class AuthSsoConfig(BaseModel):
    enabled: bool
    provider: Literal["entra"] = "entra"
    tenant_id: str | None = None
    client_id: str | None = None
    authority: str | None = None
    scopes: list[str] = Field(default_factory=lambda: ["openid", "profile", "email"])


class AuthConfigResponse(BaseModel):
    auth_mode: Literal["password", "microsoft_sso", "hybrid_dev"]
    demo_login_enabled: bool
    password_login_enabled: bool
    debug: bool
    mock_auth_enabled: bool
    sso: AuthSsoConfig
    sso_error: str | None = None


class SsoExchangeRequest(BaseModel):
    id_token: str = Field(..., min_length=1)
