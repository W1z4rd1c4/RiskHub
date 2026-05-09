from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException

from app.core.exceptions import AuthenticationError, ConflictError, to_http_exception

ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.asyncio
async def test_mock_auth_fallback_raises_authentication_error_with_bearer_header(monkeypatch) -> None:
    from app.core import security
    from app.core.config import Settings

    settings = Settings(debug=False, mock_auth_enabled=False, secret_key="test-secret-key-32-chars-minimum-value")
    monkeypatch.setattr(security, "get_settings", lambda: settings)

    with pytest.raises(AuthenticationError) as exc_info:
        await security.get_current_user(db=None, x_mock_user_id=None)  # type: ignore[arg-type]

    http_exc = to_http_exception(exc_info.value)
    assert http_exc.status_code == 401
    assert http_exc.detail == "Mock auth disabled. Use JWT authentication via /auth/login"
    assert http_exc.headers == {"WWW-Authenticate": "Bearer"}


def test_core_security_no_longer_raises_raw_http_exception_for_mock_auth() -> None:
    source = (ROOT / "backend/app/core/security.py").read_text()
    assert "raise HTTPException(" not in source


def test_approval_pending_uniqueness_conflict_uses_domain_exception() -> None:
    source = (ROOT / "backend/app/core/approval_helpers.py").read_text()
    assert "ConflictError" in source
    assert "raise HTTPException(" not in source
    assert issubclass(ConflictError, Exception)
    assert not issubclass(ConflictError, HTTPException)
