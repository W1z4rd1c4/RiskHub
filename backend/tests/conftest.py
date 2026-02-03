"""
Pytest configuration and fixtures for backend tests.
"""
import os

# Ensure app can import in test runs without requiring production secrets.
# Must run before importing any app modules that call get_settings() at import time.
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "test-secret-key")

import asyncio
from typing import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db

from app.main import app
from app.models import User, Department, Role, Risk
from app.models.user import AccessScope
from app.models.risk import RiskStatus
from app.core.security import get_current_user


# Use SQLite for testing
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def async_engine():
    """Create async engine for each test."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(async_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a new database session for each test."""
    async_session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with async_session_maker() as session:
        yield session


# Entity factories

@pytest_asyncio.fixture
async def test_department(db_session: AsyncSession) -> Department:
    """Create a test department."""
    dept = Department(name="Test Department", code="TEST", description="Test department for testing")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)
    return dept


@pytest_asyncio.fixture
async def seed_risk_types(db_session: AsyncSession):
    """Seed default risk types for API validation."""
    from app.models.risk_type import RiskTypeConfig
    
    risk_types = [
        RiskTypeConfig(
            code="operational",
            display_name="Operational",
            description="Operational risk",
            color="#3b82f6",
            is_system=True,
            sort_order=1,
        ),
        RiskTypeConfig(
            code="strategic",
            display_name="Strategic",
            description="Strategic risk",
            color="#8b5cf6",
            is_system=True,
            sort_order=2,
        ),
    ]
    for rt in risk_types:
        db_session.add(rt)
    await db_session.commit()
    return risk_types


@pytest_asyncio.fixture
async def test_role(db_session: AsyncSession) -> Role:
    """Create a test role with admin permissions."""
    from app.models import Permission, RolePermission
    
    role = Role(name="admin", display_name="Administrator", description="Admin role for testing")
    db_session.add(role)
    await db_session.commit() # Commit to get ID
    
    # Create wildcard permission
    perm = Permission(resource="*", action="*", description="Super admin access")
    db_session.add(perm)
    await db_session.commit()
    
    # Link
    role_perm = RolePermission(role_id=role.id, permission_id=perm.id)
    db_session.add(role_perm)
    await db_session.commit()
    
    await db_session.refresh(role)
    return role


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession, test_department: Department, test_role: Role) -> User:
    """Create a test user with admin role."""
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    
    user = User(
        name="Test Admin",
        email="admin@test.com",
        department_id=test_department.id,
        role_id=test_role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(user)
    await db_session.commit()
    
    # Reload with all relationships
    from app.models import Role, RolePermission
    result = await db_session.execute(
        select(User)
        .options(
            selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(User.department),
            selectinload(User.manager)
        )
        .where(User.id == user.id)
    )
    return result.scalar_one()


@pytest_asyncio.fixture
async def test_role_employee(db_session: AsyncSession) -> Role:
    """Create an employee role with limited permissions."""
    from app.models import Permission, RolePermission
    role = Role(name="employee", display_name="Employee", description="Standard employee role")
    db_session.add(role)
    await db_session.commit()
    
    # Permissions for basic list/read
    permissions = [
        Permission(resource="risks", action="read", description="Read risks"),
        Permission(resource="risks", action="write", description="Request risk edits"),
        Permission(resource="risks", action="delete", description="Request risk deletions"),
        Permission(resource="controls", action="read", description="Read controls"),
        Permission(resource="controls", action="write", description="Request control edits"),
        Permission(resource="controls", action="delete", description="Request control deletions"),
        Permission(resource="reports", action="read", description="Read reports"),
        Permission(resource="kri", action="submit", description="Submit KRI values"),
    ]
    for p in permissions:
        db_session.add(p)
    await db_session.commit()
    
    for p in permissions:
        db_session.add(RolePermission(role_id=role.id, permission_id=p.id))
    await db_session.commit()
    
    return role

@pytest_asyncio.fixture
async def test_user_employee(db_session: AsyncSession, test_department: Department, test_role_employee: Role) -> User:
    """Create an employee user."""
    user = User(
        name="Test Employee",
        email="employee@test.com",
        department_id=test_department.id,
        role_id=test_role_employee.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(user)
    await db_session.commit()
    
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    from app.models import Role, RolePermission
    result = await db_session.execute(
        select(User)
        .options(
            selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(User.department)
        )
        .where(User.id == user.id)
    )
    return result.scalar_one()


@pytest_asyncio.fixture
async def test_role_risk_manager(db_session: AsyncSession) -> Role:
    """Create a risk manager role."""
    from app.models import Permission, RolePermission
    role = Role(name="risk_manager", display_name="Risk Manager", description="Risk Manager role")
    db_session.add(role)
    await db_session.commit()
    
    perms = [
        Permission(resource="approvals", action="*", description="Manage approvals"),
        Permission(resource="risks", action="read", description="Read risks"),
    ]
    db_session.add_all(perms)
    await db_session.commit()
    for p in perms:
        await db_session.refresh(p)

    db_session.add_all([RolePermission(role_id=role.id, permission_id=p.id) for p in perms])
    await db_session.commit()
    
    return role

@pytest_asyncio.fixture
async def test_user_risk_manager(db_session: AsyncSession, test_department: Department, test_role_risk_manager: Role) -> User:
    """Create a risk manager user."""
    user = User(
        name="Test Risk Manager",
        email="rm@test.com",
        department_id=test_department.id,
        role_id=test_role_risk_manager.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(user)
    await db_session.commit()
    
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    from app.models import Role, RolePermission
    result = await db_session.execute(
        select(User)
        .options(
            selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(User.department)
        )
        .where(User.id == user.id)
    )
    return result.scalar_one()


@pytest_asyncio.fixture
async def test_role_cro(db_session: AsyncSession) -> Role:
    """Create a CRO role."""
    from app.models import Permission, RolePermission
    role = Role(name="cro", display_name="CRO", description="CRO role")
    db_session.add(role)
    await db_session.commit()
    
    # CRO has full wildcard access like admin
    perm = Permission(resource="*", action="*", description="Full access")
    db_session.add(perm)
    await db_session.commit()
    
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()
    
    return role

@pytest_asyncio.fixture
async def test_user_cro(db_session: AsyncSession, test_department: Department, test_role_cro: Role) -> User:
    """Create a CRO user."""
    user = User(
        name="Test CRO",
        email="cro@test.com",
        department_id=test_department.id,
        role_id=test_role_cro.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(user)
    await db_session.commit()
    
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    from app.models import Role, RolePermission
    result = await db_session.execute(
        select(User)
        .options(
            selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(User.department)
        )
        .where(User.id == user.id)
    )
    return result.scalar_one()


@pytest_asyncio.fixture
async def test_role_department_head(db_session: AsyncSession) -> Role:
    """Create a department head role."""
    role = Role(name="department_head", display_name="Department Head", description="Department head role")
    db_session.add(role)
    await db_session.commit()
    # Dashboard and committee endpoints require risks:read.
    from app.models import Permission, RolePermission
    perm = Permission(resource="risks", action="read", description="Read risks")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()
    return role


@pytest_asyncio.fixture
async def test_user_department_head(
    db_session: AsyncSession,
    test_department: Department,
    test_role_department_head: Role,
) -> User:
    """Create a department head user."""
    user = User(
        name="Test Department Head",
        email="depthead@test.com",
        department_id=test_department.id,
        role_id=test_role_department_head.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(user)
    await db_session.commit()

    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    from app.models import Role, RolePermission
    result = await db_session.execute(
        select(User)
        .options(
            selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(User.department),
        )
        .where(User.id == user.id)
    )
    return result.scalar_one()


@pytest_asyncio.fixture
async def test_risk(db_session: AsyncSession, test_department: Department, test_user_cro: User) -> Risk:
    """Create a test risk."""
    risk = Risk(
        risk_id_code="R-TEST-001",
        name="Test Risk",
        process="Test Process",
        description="Test Risk Description",
        category="Test Category",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)
    return risk


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create an unauthenticated async test client."""
    from app.core.config import get_settings, Settings
    
    def override_settings():
        return Settings(mock_auth_enabled=True, debug=True)
    
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def auth_client(db_session: AsyncSession, test_user: User) -> AsyncGenerator[AsyncClient, None]:
    """Create an authenticated async test client."""
    from app.api import deps
    from app.core import security
    
    async def override_get_db():
        yield db_session
    
    # IMPORTANT: Dependencies must be async if they perform DB operations or are used in async contexts
    async def override_get_current_user():
        return test_user
    
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[deps.get_current_user] = override_get_current_user
    app.dependency_overrides[security.get_current_user] = override_get_current_user
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def client_employee(db_session: AsyncSession, test_user_employee: User) -> AsyncGenerator[AsyncClient, None]:
    """Client for employee user using header-based mock auth."""
    from app.core.config import get_settings, Settings
    
    def override_settings():
        return Settings(mock_auth_enabled=True, debug=True)
        
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings
    
    transport = ASGITransport(app=app)
    headers = {"X-Mock-User-Id": str(test_user_employee.id)}
    async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def client_risk_manager(db_session: AsyncSession, test_user_risk_manager: User) -> AsyncGenerator[AsyncClient, None]:
    """Client for risk manager user using header-based mock auth."""
    from app.core.config import get_settings, Settings
    
    def override_settings():
        return Settings(mock_auth_enabled=True, debug=True)
        
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings
    
    transport = ASGITransport(app=app)
    headers = {"X-Mock-User-Id": str(test_user_risk_manager.id)}
    async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers(test_user: User) -> dict:
    """Convenience headers for mock-authenticated requests using the default test user."""
    return {"X-Mock-User-Id": str(test_user.id)}


@pytest_asyncio.fixture(scope="function")
async def client_cro(db_session: AsyncSession, test_user_cro: User) -> AsyncGenerator[AsyncClient, None]:
    """Client for CRO user using header-based mock auth."""
    from app.core.config import get_settings, Settings
    
    def override_settings():
        return Settings(mock_auth_enabled=True, debug=True)
        
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings
    
    transport = ASGITransport(app=app)
    headers = {"X-Mock-User-Id": str(test_user_cro.id)}
    async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def client_department_head(
    db_session: AsyncSession,
    test_user_department_head: User,
) -> AsyncGenerator[AsyncClient, None]:
    """Client for department head user using header-based mock auth."""
    from app.core.config import get_settings, Settings

    def override_settings():
        return Settings(mock_auth_enabled=True, debug=True)

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = override_settings

    transport = ASGITransport(app=app)
    headers = {"X-Mock-User-Id": str(test_user_department_head.id)}
    async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as ac:
        yield ac

    app.dependency_overrides.clear()
