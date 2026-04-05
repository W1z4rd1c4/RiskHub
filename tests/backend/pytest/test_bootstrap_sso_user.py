from __future__ import annotations

import argparse
from contextlib import asynccontextmanager

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import User
from app.schemas.directory import DirectoryUserRead
from scripts import bootstrap_sso_user


@pytest.mark.asyncio
async def test_bootstrap_sso_user_persists_entra_business_role_from_directory_lookup(
    db_session: AsyncSession,
    test_role,
    monkeypatch: pytest.MonkeyPatch,
):
    settings = Settings(
        _env_file=None,
        secret_key="test-secret-key-32-chars-minimum-value",
        database_url="sqlite+aiosqlite:///:memory:",
        auth_mode="microsoft_sso",
        entra_business_role_attribute_name="riskhubBusinessRole",
    )

    @asynccontextmanager
    async def fake_session_context(_settings: Settings):
        yield db_session

    async def fake_resolve_directory_user(email_or_upn: str) -> DirectoryUserRead:
        assert email_or_upn == "leader@example.com"
        return DirectoryUserRead(
            external_id="oid-bootstrap",
            display_name="Bootstrap Leader",
            email="Leader@Example.com",
            user_principal_name="Leader@Example.com",
            department=None,
            job_title="Regional Leader",
            business_role="Regional Director",
            account_enabled=True,
            source="graph",
        )

    monkeypatch.setattr(bootstrap_sso_user, "get_settings", lambda: settings)
    monkeypatch.setattr(bootstrap_sso_user, "session_context", fake_session_context)
    monkeypatch.setattr(bootstrap_sso_user, "_resolve_directory_user", fake_resolve_directory_user)

    rc = await bootstrap_sso_user._run(
        argparse.Namespace(
            email="leader@example.com",
            external_id=None,
            role=test_role.name,
            access_scope="global",
            department=None,
            name=None,
        )
    )

    assert rc == 0
    user = (await db_session.execute(select(User).where(User.external_id == "oid-bootstrap"))).scalar_one()
    assert user.email == "leader@example.com"
    assert user.name == "Bootstrap Leader"
    assert user.entra_business_role == "Regional Director"
    assert user.entra_business_role_last_synced_at is not None


@pytest.mark.asyncio
async def test_bootstrap_sso_user_does_not_sync_entra_business_role_when_feature_disabled(
    db_session: AsyncSession,
    test_role,
    monkeypatch: pytest.MonkeyPatch,
):
    settings = Settings(
        _env_file=None,
        secret_key="test-secret-key-32-chars-minimum-value",
        database_url="sqlite+aiosqlite:///:memory:",
        auth_mode="microsoft_sso",
    )

    @asynccontextmanager
    async def fake_session_context(_settings: Settings):
        yield db_session

    async def fake_resolve_directory_user(email_or_upn: str) -> DirectoryUserRead:
        assert email_or_upn == "leader@example.com"
        return DirectoryUserRead(
            external_id="oid-bootstrap-disabled",
            display_name="Bootstrap Leader",
            email="Leader@Example.com",
            user_principal_name="Leader@Example.com",
            department=None,
            job_title="Regional Leader",
            business_role="Regional Director",
            account_enabled=True,
            source="graph",
        )

    monkeypatch.setattr(bootstrap_sso_user, "get_settings", lambda: settings)
    monkeypatch.setattr(bootstrap_sso_user, "session_context", fake_session_context)
    monkeypatch.setattr(bootstrap_sso_user, "_resolve_directory_user", fake_resolve_directory_user)

    rc = await bootstrap_sso_user._run(
        argparse.Namespace(
            email="leader@example.com",
            external_id=None,
            role=test_role.name,
            access_scope="global",
            department=None,
            name=None,
        )
    )

    assert rc == 0
    user = (await db_session.execute(select(User).where(User.external_id == "oid-bootstrap-disabled"))).scalar_one()
    assert user.email == "leader@example.com"
    assert user.name == "Bootstrap Leader"
    assert user.entra_business_role is None
    assert user.entra_business_role_last_synced_at is None
