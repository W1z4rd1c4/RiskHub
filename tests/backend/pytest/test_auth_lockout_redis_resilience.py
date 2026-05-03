from __future__ import annotations

import pytest

from app.core.config import Settings, get_settings
from app.main import app
from app.services.account_lockout_service import AccountLockoutBackendError, AccountLockoutService

TEST_ORIGIN = "http://test"
ALLOWED_ORIGIN_HEADERS = {"Origin": TEST_ORIGIN}


def _set_login_allowed_origin() -> None:
    def override_settings():
        return Settings(mock_auth_enabled=True, debug=True, cors_origins=[TEST_ORIGIN])

    app.dependency_overrides[get_settings] = override_settings


class _FailingLockoutBackend:
    async def is_locked(self, identifier: str):  # noqa: ARG002
        raise AccountLockoutBackendError("redis lockout backend unavailable")

    async def record_failed_attempt(self, identifier: str):  # noqa: ARG002
        raise AccountLockoutBackendError("redis lockout backend unavailable")

    async def record_successful_login(self, identifier: str):  # noqa: ARG002
        raise AccountLockoutBackendError("redis lockout backend unavailable")


class _UnexpectedFailingLockoutBackend:
    async def is_locked(self, identifier: str):  # noqa: ARG002
        raise ValueError("unexpected lockout backend failure")

    async def record_failed_attempt(self, identifier: str):  # noqa: ARG002
        raise ValueError("unexpected lockout backend failure")

    async def record_successful_login(self, identifier: str):  # noqa: ARG002
        raise ValueError("unexpected lockout backend failure")


@pytest.mark.asyncio
async def test_login_fails_closed_when_lockout_backend_unavailable(client):
    _set_login_allowed_origin()
    original = app.state.account_lockout
    app.state.account_lockout = AccountLockoutService(_FailingLockoutBackend())

    try:
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@example.com", "password": "invalid"},
            headers=ALLOWED_ORIGIN_HEADERS,
        )
    finally:
        app.state.account_lockout = original

    assert response.status_code == 503
    assert response.headers.get("Retry-After") == "5"


@pytest.mark.asyncio
async def test_login_does_not_swallow_unexpected_lockout_backend_errors(client):
    _set_login_allowed_origin()
    original = app.state.account_lockout
    app.state.account_lockout = AccountLockoutService(_UnexpectedFailingLockoutBackend())

    try:
        with pytest.raises(ValueError, match="unexpected lockout backend failure"):
            await client.post(
                "/api/v1/auth/login",
                json={"email": "nobody@example.com", "password": "invalid"},
                headers=ALLOWED_ORIGIN_HEADERS,
            )
    finally:
        app.state.account_lockout = original
