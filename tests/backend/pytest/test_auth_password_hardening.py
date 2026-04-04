from __future__ import annotations

import pytest

from app.api.v1.endpoints.auth import password as password_endpoint
from app.core.security import get_password_hash


@pytest.mark.asyncio
async def test_missing_user_login_uses_dummy_verifier_and_returns_generic_401(client, monkeypatch):
    calls: list[str | None] = []
    real_verify = password_endpoint.verify_password_or_dummy

    def tracking_verify(plain_password: str, hashed_password: str | None) -> bool:
        calls.append(hashed_password)
        return real_verify(plain_password, hashed_password)

    monkeypatch.setattr(password_endpoint, "verify_password_or_dummy", tracking_verify)

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "missing-user@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}
    assert calls == [None]


@pytest.mark.asyncio
async def test_wrong_password_login_uses_stored_hash_and_returns_generic_401(
    client,
    db_session,
    test_user,
    monkeypatch,
):
    test_user.hashed_password = get_password_hash("correct-password")
    db_session.add(test_user)
    await db_session.commit()

    calls: list[str | None] = []
    real_verify = password_endpoint.verify_password_or_dummy

    def tracking_verify(plain_password: str, hashed_password: str | None) -> bool:
        calls.append(hashed_password)
        return real_verify(plain_password, hashed_password)

    monkeypatch.setattr(password_endpoint, "verify_password_or_dummy", tracking_verify)

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_user.email, "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}
    assert calls == [test_user.hashed_password]


@pytest.mark.asyncio
async def test_successful_password_login_still_issues_tokens(client, db_session, test_user):
    password = "correct-password"
    test_user.hashed_password = get_password_hash(password)
    test_user.email = "normalized.login@example.com"
    db_session.add(test_user)
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "Normalized.Login@Example.com", "password": password},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == "normalized.login@example.com"
    cookie_header = response.headers.get("set-cookie", "")
    assert "riskhub_refresh_token=" in cookie_header
    assert "riskhub_refresh_hint=1" in cookie_header
