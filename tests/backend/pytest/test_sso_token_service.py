from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from app.core.config import Settings
from app.services.sso_token_service import EntraTokenVerifier, SsoTokenVerificationError


def _make_rsa_keypair() -> tuple[bytes, rsa.RSAPublicKey]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return priv_pem, key.public_key()


async def _allow_resolved_outbound_guard(*_args, **_kwargs) -> None:
    return None


@pytest.mark.asyncio
async def test_sso_token_service_validates_and_extracts_claims(monkeypatch: pytest.MonkeyPatch):
    tenant_id = "00000000-0000-0000-0000-000000000000"
    client_id = "11111111-1111-1111-1111-111111111111"
    discovery_url = "https://example.test/oidc"
    jwks_url = "https://example.test/jwks"
    issuer = f"https://login.microsoftonline.com/{tenant_id}/v2.0"

    priv_pem, public_key = _make_rsa_keypair()
    kid = "kid-1"
    public_jwk = json.loads(RSAAlgorithm.to_jwk(public_key))
    public_jwk["kid"] = kid
    jwks = {"keys": [public_jwk]}

    now = datetime.now(UTC)
    claims = {
        "iss": issuer,
        "aud": client_id,
        "tid": tenant_id,
        "oid": "oid-123",
        "preferred_username": "User@Example.com",
        "name": "Test User",
        "extn.riskhubBusinessRole": "Regional Director",
        "iat": int(now.timestamp()),
        "nbf": int((now - timedelta(seconds=5)).timestamp()),
        "exp": int((now + timedelta(minutes=5)).timestamp()),
    }
    token = jwt.encode(claims, priv_pem, algorithm="RS256", headers={"kid": kid})

    settings = Settings(
        secret_key="test-secret-key-32-chars-minimum-value",
        auth_mode="microsoft_sso",
        entra_tenant_id=tenant_id,
        entra_client_id=client_id,
        entra_business_role_attribute_name="riskhubBusinessRole",
        entra_oidc_discovery_url=discovery_url,
    )
    verifier = EntraTokenVerifier(settings=settings)
    monkeypatch.setattr(
        "app.services.sso_token_service.guard_resolved_outbound_url",
        _allow_resolved_outbound_guard,
    )

    async def fake_fetch_json(url: str):
        if url == discovery_url:
            return {"issuer": issuer, "jwks_uri": jwks_url}
        if url == jwks_url:
            return jwks
        raise AssertionError(f"Unexpected fetch url: {url}")

    verifier._fetch_json = fake_fetch_json  # type: ignore[method-assign]

    identity = await verifier.verify_id_token(id_token=token)
    assert identity.tenant_id == tenant_id
    assert identity.external_id == "oid-123"
    assert identity.email == "user@example.com"
    assert identity.name == "Test User"
    assert identity.business_role == "Regional Director"


@pytest.mark.asyncio
async def test_sso_token_service_refreshes_jwks_on_unknown_kid(monkeypatch: pytest.MonkeyPatch):
    tenant_id = "00000000-0000-0000-0000-000000000000"
    client_id = "11111111-1111-1111-1111-111111111111"
    discovery_url = "https://example.test/oidc"
    jwks_url = "https://example.test/jwks"
    issuer = f"https://login.microsoftonline.com/{tenant_id}/v2.0"

    priv_pem, public_key = _make_rsa_keypair()
    kid = "kid-rotate"
    public_jwk = json.loads(RSAAlgorithm.to_jwk(public_key))
    public_jwk["kid"] = kid

    now = datetime.now(UTC)
    claims = {
        "iss": issuer,
        "aud": client_id,
        "tid": tenant_id,
        "oid": "oid-rotate",
        "preferred_username": "rotate@example.com",
        "exp": int((now + timedelta(minutes=5)).timestamp()),
    }
    token = jwt.encode(claims, priv_pem, algorithm="RS256", headers={"kid": kid})

    settings = Settings(
        secret_key="test-secret-key-32-chars-minimum-value",
        auth_mode="microsoft_sso",
        entra_tenant_id=tenant_id,
        entra_client_id=client_id,
        entra_oidc_discovery_url=discovery_url,
    )
    verifier = EntraTokenVerifier(settings=settings)
    monkeypatch.setattr(
        "app.services.sso_token_service.guard_resolved_outbound_url",
        _allow_resolved_outbound_guard,
    )

    jwks_calls = {"count": 0}

    async def fake_fetch_json(url: str):
        if url == discovery_url:
            return {"issuer": issuer, "jwks_uri": jwks_url}
        if url == jwks_url:
            jwks_calls["count"] += 1
            if jwks_calls["count"] == 1:
                return {"keys": []}
            return {"keys": [public_jwk]}
        raise AssertionError(f"Unexpected fetch url: {url}")

    verifier._fetch_json = fake_fetch_json  # type: ignore[method-assign]

    identity = await verifier.verify_id_token(id_token=token)
    assert identity.external_id == "oid-rotate"
    assert jwks_calls["count"] == 2


@pytest.mark.asyncio
async def test_sso_token_service_rejects_unapproved_email_domain(monkeypatch: pytest.MonkeyPatch):
    tenant_id = "00000000-0000-0000-0000-000000000000"
    client_id = "11111111-1111-1111-1111-111111111111"
    discovery_url = "https://example.test/oidc"
    jwks_url = "https://example.test/jwks"
    issuer = f"https://login.microsoftonline.com/{tenant_id}/v2.0"

    priv_pem, public_key = _make_rsa_keypair()
    kid = "kid-2"
    public_jwk = json.loads(RSAAlgorithm.to_jwk(public_key))
    public_jwk["kid"] = kid
    jwks = {"keys": [public_jwk]}

    now = datetime.now(UTC)
    claims = {
        "iss": issuer,
        "aud": client_id,
        "tid": tenant_id,
        "oid": "oid-123",
        "preferred_username": "user@not-allowed.test",
        "exp": int((now + timedelta(minutes=5)).timestamp()),
    }
    token = jwt.encode(claims, priv_pem, algorithm="RS256", headers={"kid": kid})

    settings = Settings(
        secret_key="test-secret-key-32-chars-minimum-value",
        auth_mode="microsoft_sso",
        entra_tenant_id=tenant_id,
        entra_client_id=client_id,
        entra_allowed_email_domains=["example.com"],
        entra_oidc_discovery_url=discovery_url,
    )
    verifier = EntraTokenVerifier(settings=settings)
    monkeypatch.setattr(
        "app.services.sso_token_service.guard_resolved_outbound_url",
        _allow_resolved_outbound_guard,
    )

    async def fake_fetch_json(url: str):
        if url == discovery_url:
            return {"issuer": issuer, "jwks_uri": jwks_url}
        if url == jwks_url:
            return jwks
        raise AssertionError(f"Unexpected fetch url: {url}")

    verifier._fetch_json = fake_fetch_json  # type: ignore[method-assign]

    with pytest.raises(SsoTokenVerificationError) as exc:
        await verifier.verify_id_token(id_token=token)
    assert exc.value.code == "email_domain_not_allowed"
