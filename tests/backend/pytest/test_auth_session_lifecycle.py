from datetime import timedelta
from unittest.mock import AsyncMock

import pytest

from app.api import deps
from app.core.config import Settings
from app.core.datetime_utils import utc_now
from app.db.session import create_engine
from app.main import create_app
from app.models import User


class _UserResult:
    def __init__(self, user: User) -> None:
        self._user = user

    def scalar_one_or_none(self) -> User:
        return self._user


class _AuthSession:
    def __init__(self, user: User) -> None:
        self.user = user
        self.execute = AsyncMock(return_value=_UserResult(user))
        self.commit = AsyncMock()

    def add(self, value: object) -> None:
        assert value is self.user


@pytest.mark.parametrize(
    ("environment", "settings", "expected_echo"),
    [
        (
            {"SQLALCHEMY_ECHO": "true"},
            {"debug": False, "mock_auth_enabled": False, "auth_mode": "password"},
            False,
        ),
        (
            {"SQLALCHEMY_ECHO": "false"},
            {"debug": True, "mock_auth_enabled": False, "auth_mode": "hybrid_dev"},
            True,
        ),
        (
            {"E2E_SQLALCHEMY_ECHO": "false"},
            {"debug": True, "mock_auth_enabled": True, "auth_mode": "hybrid_dev"},
            False,
        ),
    ],
)
@pytest.mark.asyncio
async def test_statement_echo_override_is_scoped_to_canonical_e2e_runtime(
    monkeypatch: pytest.MonkeyPatch,
    environment: dict[str, str],
    settings: dict[str, object],
    expected_echo: bool,
) -> None:
    monkeypatch.delenv("SQLALCHEMY_ECHO", raising=False)
    monkeypatch.delenv("E2E_SQLALCHEMY_ECHO", raising=False)
    for name, value in environment.items():
        monkeypatch.setenv(name, value)

    engine = create_engine(Settings(**settings))  # type: ignore[arg-type]
    try:
        assert engine.echo is expected_echo
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_stale_last_active_write_releases_the_auth_transaction(monkeypatch: pytest.MonkeyPatch) -> None:
    user = User(
        id=7,
        email="active@example.com",
        hashed_password="hash",
        name="Active User",
        role_id=1,
        is_active=True,
        token_version=0,
        last_active_at=utc_now() - timedelta(minutes=2),
    )
    db = _AuthSession(user)
    monkeypatch.setattr(
        deps,
        "decode_access_token",
        lambda _token, *, settings: {"user_id": user.id, "token_version": user.token_version},
    )

    resolved = await deps._resolve_bearer_user(
        db=db,  # type: ignore[arg-type]
        settings=Settings(),
        token="valid-token",
        update_last_active=True,
        optional=False,
    )

    assert resolved is user
    db.commit.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_debug_runtime_can_disable_statement_echo_without_disabling_mock_auth(
    monkeypatch: pytest.MonkeyPatch,
    client_factory,
    test_user: User,
) -> None:
    monkeypatch.setenv("E2E_SQLALCHEMY_ECHO", "false")
    settings = Settings(debug=True, mock_auth_enabled=True, auth_mode="hybrid_dev")
    runtime_app = create_app(settings)

    try:
        assert runtime_app.state.db_engine.echo is False
        async with client_factory(user=test_user, settings=settings) as client:
            response = await client.get("/api/v1/users/me/shell-summary")
        assert response.status_code == 200
    finally:
        await runtime_app.state.db_engine.dispose()

    monkeypatch.delenv("E2E_SQLALCHEMY_ECHO")
    default_app = create_app(
        Settings(debug=True, mock_auth_enabled=True, auth_mode="hybrid_dev")
    )
    try:
        assert default_app.state.db_engine.echo is True
    finally:
        await default_app.state.db_engine.dispose()
