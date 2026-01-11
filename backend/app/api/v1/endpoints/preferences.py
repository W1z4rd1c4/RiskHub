"""User preferences endpoints for theme and language settings."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, field_validator

from app.db.session import get_db
from app.api import deps
from app.models.user import User

router = APIRouter(prefix="/preferences", tags=["preferences"])


class PreferencesUpdate(BaseModel):
    """Schema for updating user preferences."""
    theme: str | None = None
    language: str | None = None
    
    @field_validator('theme')
    @classmethod
    def validate_theme(cls, v: str | None) -> str | None:
        if v is not None and v not in ('light', 'dark', 'riskhub'):
            raise ValueError('Invalid theme. Must be one of: light, dark, riskhub')
        return v
    
    @field_validator('language')
    @classmethod
    def validate_language(cls, v: str | None) -> str | None:
        if v is not None and v not in ('en', 'cs'):
            raise ValueError('Invalid language. Must be one of: en, cs')
        return v


class PreferencesResponse(BaseModel):
    """Response schema for user preferences."""
    theme: str
    language: str


@router.get("", response_model=PreferencesResponse)
async def get_preferences(
    current_user: User = Depends(deps.get_current_user),
) -> PreferencesResponse:
    """Get current user's preferences."""
    return PreferencesResponse(
        theme=current_user.preferred_theme,
        language=current_user.preferred_language,
    )


@router.put("", response_model=PreferencesResponse)
async def update_preferences(
    data: PreferencesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> PreferencesResponse:
    """Update current user's preferences."""
    if data.theme is not None:
        current_user.preferred_theme = data.theme
    if data.language is not None:
        current_user.preferred_language = data.language
    
    await db.commit()
    await db.refresh(current_user)
    
    return PreferencesResponse(
        theme=current_user.preferred_theme,
        language=current_user.preferred_language,
    )
