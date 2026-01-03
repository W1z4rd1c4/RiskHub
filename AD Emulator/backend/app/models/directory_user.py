"""Directory user model for AD Emulator."""
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import Base


class DirectoryUser(Base):
    """
    Directory user entry - the source of truth for AD/Entra simulation.
    
    This model represents users in the simulated Active Directory.
    RiskHub will fetch these users via HTTP and sync them into its own users table.
    
    Note: No foreign key to RiskHub's users table - this is a standalone entity.
    """
    __tablename__ = "directory_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    
    # AD-like identifiers
    external_id: Mapped[str] = mapped_column(
        String(100), unique=True, index=True, nullable=False,
        comment="Simulates AD objectGUID or Entra ID"
    )
    user_principal_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True,
        comment="UPN like user@domain.com"
    )
    email: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True,
        comment="Primary email address"
    )
    
    # User details
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    given_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    surname: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # Organization
    department: Mapped[str | None] = mapped_column(
        String(255), nullable=True,
        comment="Department name (not FK - this is standalone)"
    )
    job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    manager_external_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True,
        comment="References another DirectoryUser.external_id for org hierarchy"
    )
    employee_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="employee",
        comment="Role type: head (Department Head), employee, contractor"
    )
    
    # Account status
    account_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, index=True,
        comment="Like AD accountEnabled attribute"
    )
    
    # Auth simulation (optional - for testing auth flows)
    password_hash: Mapped[str | None] = mapped_column(
        String(255), nullable=True,
        comment="Bcrypt hash for simulating AD auth"
    )
    
    # Extensibility
    source_payload: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True,
        comment="Raw payload from external sources if needed"
    )
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
