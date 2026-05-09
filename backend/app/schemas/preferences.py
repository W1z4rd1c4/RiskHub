"""User preferences request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, field_validator


class PreferencesUpdate(BaseModel):
    """Schema for updating user preferences."""

    theme: str | None = None
    language: str | None = None

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, v: str | None) -> str | None:
        if v is not None and v not in ("light", "dark", "riskhub"):
            raise ValueError("Invalid theme. Must be one of: light, dark, riskhub")
        return v

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str | None) -> str | None:
        if v is not None and v not in ("en", "cs"):
            raise ValueError("Invalid language. Must be one of: en, cs")
        return v


class PreferencesResponse(BaseModel):
    """Response schema for user preferences."""

    theme: str
    language: str
