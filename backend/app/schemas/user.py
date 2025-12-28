from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


class RoleBase(BaseModel):
    """Base schema for Role."""
    name: str
    display_name: str
    description: Optional[str] = None


class RoleRead(RoleBase):
    """Schema for reading Role."""
    id: int
    
    model_config = {"from_attributes": True}


class UserBase(BaseModel):
    """Base schema for User."""
    email: EmailStr
    name: str
    is_active: bool = True
    role_id: int
    department_id: Optional[int] = None
    manager_id: Optional[int] = None  # Manager-employee hierarchy


class UserCreate(UserBase):
    """Schema for creating User."""
    password: str  # Plain password, will be hashed


class UserUpdate(BaseModel):
    """Schema for updating an existing user."""
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[int] = None
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    is_active: Optional[bool] = None


class UserRead(BaseModel):
    """Schema for reading User."""
    id: int
    email: str
    name: str
    is_active: bool
    role: RoleRead
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    manager_name: Optional[str] = None  # Manager's name
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}


class UserBrief(BaseModel):
    """Brief user info for current user endpoint."""
    id: int
    email: str
    name: str
    role: str
    role_display_name: str
    permissions: list[str]
    department_id: Optional[int] = None
    department_name: Optional[str] = None

    
    model_config = {"from_attributes": True}


class DepartmentBase(BaseModel):
    """Base schema for Department."""
    name: str
    code: str
    description: Optional[str] = None


class DepartmentRead(DepartmentBase):
    """Schema for reading Department."""
    id: int
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}
