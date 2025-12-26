from datetime import datetime
from sqlalchemy import String, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class RoleType:
    """Standard role names for non-life insurance company."""
    # C-Suite
    CEO = "ceo"
    CFO = "cfo"
    CRO = "cro"
    COO = "coo"
    
    # Governance
    RISK_MANAGER = "risk_manager"
    COMPLIANCE = "compliance"
    LEGAL = "legal"
    INTERNAL_AUDIT = "internal_audit"
    ACTUARIAL = "actuarial"
    
    # Department
    DEPARTMENT_HEAD = "department_head"
    EMPLOYEE = "employee"
    
    # System
    ADMIN = "admin"
    VIEWER = "viewer"
    
    @classmethod
    def privileged_roles(cls):
        """Roles with full system access."""
        return {cls.CEO, cls.CFO, cls.CRO, cls.RISK_MANAGER, 
                cls.COMPLIANCE, cls.LEGAL, cls.INTERNAL_AUDIT, cls.ACTUARIAL, cls.ADMIN}


class Role(Base):
    """Role model for SII-compliant access control."""
    __tablename__ = "roles"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(255), nullable=True)
    
    # Relationships
    users: Mapped[list["User"]] = relationship("User", back_populates="role")
    permissions: Mapped[list["RolePermission"]] = relationship("RolePermission", back_populates="role")


class Permission(Base):
    """Permission model for resource-action based access control."""
    __tablename__ = "permissions"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    resource: Mapped[str] = mapped_column(String(50), index=True)  # controls, departments, reports, users
    action: Mapped[str] = mapped_column(String(50))  # read, write, delete, approve
    description: Mapped[str] = mapped_column(String(255), nullable=True)
    
    # Relationships
    role_permissions: Mapped[list["RolePermission"]] = relationship("RolePermission", back_populates="permission")


class RolePermission(Base):
    """Many-to-many relationship between roles and permissions."""
    __tablename__ = "role_permissions"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), index=True)
    permission_id: Mapped[int] = mapped_column(ForeignKey("permissions.id"), index=True)
    
    # Relationships
    role: Mapped["Role"] = relationship("Role", back_populates="permissions")
    permission: Mapped["Permission"] = relationship("Permission", back_populates="role_permissions")
