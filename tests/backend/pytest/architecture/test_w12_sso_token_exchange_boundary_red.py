from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SSO = REPO_ROOT / "backend/app/api/v1/endpoints/auth/sso.py"
SHARED = REPO_ROOT / "backend/app/api/v1/endpoints/auth/_shared.py"
AUTH_SESSION = REPO_ROOT / "backend/app/services/_auth_session/sso_challenges.py"


def test_sso_module_uses_auth_session_exchange_boundary() -> None:
    sso_text = SSO.read_text()
    assert "from app.services._auth_session import resolve_sso_exchange" in sso_text
    assert "exchange = await resolve_sso_exchange(" in sso_text
    assert "_build_token_response(" in sso_text
    assert "_issue_refresh_session(" in sso_text
    assert "create_access_token" not in sso_text

    shared_text = SHARED.read_text()
    assert "create_access_token" in shared_text
    assert "create_refresh_token" in shared_text

    auth_session_text = AUTH_SESSION.read_text()
    assert "async def resolve_sso_exchange" in auth_session_text
