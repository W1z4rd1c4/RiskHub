"""Pydantic schemas for directory emulator users."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class DirectoryUserBase(BaseModel):
    """Base schema for directory users."""
    external_id: str = Field(..., max_length=100)
    user_principal_name: Optional[str] = Field(None, max_length=255)
    email: Optional[EmailStr] = None
    display_name: str = Field(..., max_length=255)
    given_name: Optional[str] = Field(None, max_length=100)
    surname: Optional[str] = Field(None, max_length=100)
    department: Optional[str] = Field(None, max_length=255)
    job_title: Optional[str] = Field(None, max_length=255)
    manager_external_id: Optional[str] = Field(None, max_length=100)
    account_enabled: bool = True
    source_payload: Optional[dict] = None


class DirectoryUserCreate(DirectoryUserBase):
    """Schema for creating a directory user."""
    pass


class DirectoryUserUpdate(BaseModel):
    """Schema for updating a directory user."""
    user_principal_name: Optional[str] = Field(None, max_length=255)
    email: Optional[EmailStr] = None
    display_name: Optional[str] = Field(None, max_length=255)
    given_name: Optional[str] = Field(None, max_length=100)
    surname: Optional[str] = Field(None, max_length=100)
    department: Optional[str] = Field(None, max_length=255)
    job_title: Optional[str] = Field(None, max_length=255)
    manager_external_id: Optional[str] = Field(None, max_length=100)
    account_enabled: Optional[bool] = None
    source_payload: Optional[dict] = None


class DirectoryUserRead(DirectoryUserBase):
    """Schema for reading directory user details."""
    id: int
    user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

