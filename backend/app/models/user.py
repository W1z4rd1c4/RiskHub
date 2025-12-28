from datetime import datetime
from sqlalchemy import String, Boolean, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class User(Base):
    """User model with role-based access control."""
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Authentication (nullable for future Entra ID integration)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Role relationship
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    role: Mapped["Role"] = relationship("Role", back_populates="users")
    
    # Department relationship (optional)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    department: Mapped["Department"] = relationship("Department", back_populates="users")
    
    # Manager-employee hierarchy
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    manager: Mapped["User | None"] = relationship("User", remote_side=[id], back_populates="subordinates", foreign_keys="User.manager_id")
    subordinates: Mapped[list["User"]] = relationship("User", back_populates="manager", foreign_keys="User.manager_id")
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Control relationships
    owned_controls: Mapped[list["Control"]] = relationship(
        "Control", 
        foreign_keys="Control.control_owner_id",
        back_populates="control_owner"
    )
    executed_controls: Mapped[list["ControlExecution"]] = relationship(
        "ControlExecution",
        back_populates="executed_by"
    )
    
    # Risk relationships
    owned_risks: Mapped[list["Risk"]] = relationship(
        "Risk",
        foreign_keys="Risk.owner_id",
        back_populates="owner"
    )
    
    # Notification relationship
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification",
        back_populates="user"
    )

    @property
    def manager_name(self) -> str | None:
        """Get manager's name if manager exists."""
        return self.manager.name if self.manager else None


# Import for type hints
from app.models.role import Role
from app.models.department import Department
from app.models.control import Control
from app.models.control_execution import ControlExecution
from app.models.risk import Risk
from app.models.notification import Notification


