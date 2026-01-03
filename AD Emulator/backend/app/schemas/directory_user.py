"""Pydantic schemas for directory users."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class DirectoryUserBase(BaseModel):
    """Base schema for directory users."""
    user_principal_name: Optional[str] = Field(None, max_length=255)
    email: Optional[str] = None
    display_name: str = Field(..., max_length=255)
    given_name: Optional[str] = Field(None, max_length=100)
    surname: Optional[str] = Field(None, max_length=100)
    department: Optional[str] = Field(None, max_length=255)
    job_title: Optional[str] = Field(None, max_length=255)
    manager_external_id: Optional[str] = Field(None, max_length=100)
    account_enabled: bool = True
    employee_type: str = Field("employee", max_length=50, description="Role type: head, employee, contractor")


class DirectoryUserCreate(DirectoryUserBase):
    """Schema for creating a directory user."""
    external_id: str = Field(..., max_length=100)
    password: Optional[str] = Field(None, min_length=4, description="Optional password for auth simulation")


class DirectoryUserUpdate(BaseModel):
    """Schema for updating a directory user."""
    user_principal_name: Optional[str] = Field(None, max_length=255)
    email: Optional[str] = None
    display_name: Optional[str] = Field(None, max_length=255)
    given_name: Optional[str] = Field(None, max_length=100)
    surname: Optional[str] = Field(None, max_length=100)
    department: Optional[str] = Field(None, max_length=255)
    job_title: Optional[str] = Field(None, max_length=255)
    manager_external_id: Optional[str] = Field(None, max_length=100)
    account_enabled: Optional[bool] = None
    employee_type: Optional[str] = Field(None, max_length=50)
    password: Optional[str] = Field(None, min_length=4)


class DirectoryUserRead(DirectoryUserBase):
    """Schema for reading directory user details."""
    id: int
    external_id: str
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}


class DirectoryUserListResponse(BaseModel):
    """Paginated list of directory users."""
    items: list[DirectoryUserRead]
    total: int
    page: int = 1
    page_size: int = 100
