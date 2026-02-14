"""Pydantic schemas for authentication."""
from pydantic import BaseModel

from app.schemas.user import UserBrief


class LoginRequest(BaseModel):
    """Schema for login request."""
    email: str  # Changed from EmailStr to allow .test TLD for testing
    password: str


class TokenResponse(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    token_type: str = "bearer"
    user: UserBrief  # Use specific schema instead of dict
