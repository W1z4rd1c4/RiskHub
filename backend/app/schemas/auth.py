"""Pydantic schemas for authentication."""
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    """Schema for login request."""
    email: str  # Changed from EmailStr to allow .test TLD for testing
    password: str


class TokenResponse(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    token_type: str = "bearer"
    user: dict  # UserBrief serialized
