from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class RoleType(StrEnum):
    """Standard role names for non-life insurance company.

    Using StrEnum for type safety - values work directly in string comparisons
    without needing .value (e.g., user.role.name == RoleType.CRO works)
    """

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
    CONTROL_OWNER = "control_owner"
    EMPLOYEE = "employee"

    # System
    ADMIN = "admin"
    VIEWER = "viewer"

    @classmethod
    def privileged_roles(cls) -> set["RoleType"]:
        """Roles with business data access (risks, controls, KRIs).

        Note: ADMIN is intentionally excluded - they have platform access only.
        Use system_admin_roles() for IT/platform administration checks.
        """
        return {
            cls.CEO,
            cls.CFO,
            cls.CRO,
            cls.RISK_MANAGER,
            cls.COMPLIANCE,
            cls.LEGAL,
            cls.INTERNAL_AUDIT,
            cls.ACTUARIAL,
        }

    @classmethod
    def system_admin_roles(cls) -> set["RoleType"]:
        """Roles with platform administration access (users, logs, health).

        These roles manage the platform but NOT business data.
        """
        return {cls.ADMIN}

    @classmethod
    def cro_only_roles(cls) -> set["RoleType"]:
        """Roles with Risk Hub access (business configuration).

        Only CRO can configure risk types, thresholds, and approval rules.
        """
        return {cls.CRO}


class Role(Base):
    """Role model for SII-compliant access control."""

    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(255), nullable=True)

    # Management flags for CRO role administration
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    # Relationships
    users: Mapped[list[User]] = relationship("User", back_populates="role")
    permissions: Mapped[list["RolePermission"]] = relationship(
        "RolePermission", back_populates="role", cascade="all, delete-orphan"
    )


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
