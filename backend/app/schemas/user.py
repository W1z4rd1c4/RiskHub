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
    
    class Config:
        from_attributes = True


class UserBase(BaseModel):
    """Base schema for User."""
    email: EmailStr
    name: str
    is_active: bool = True
    role_id: int
    department_id: Optional[int] = None


class UserCreate(UserBase):
    """Schema for creating User."""
    pass


class UserRead(BaseModel):
    """Schema for reading User."""
    id: int
    email: str
    name: str
    is_active: bool
    role: RoleRead
    department_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class UserBrief(BaseModel):
    """Brief user info for current user endpoint."""
    id: int
    email: str
    name: str
    role: str
    role_display_name: str
    permissions: list[str]
    
    class Config:
        from_attributes = True


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
    
    class Config:
        from_attributes = True
