from __future__ import annotations

import asyncio
import json
import time
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from app.core.activity_logger import audit_logger
from app.core.config import Settings
from app.services.sso_token_service import (
    EntraTokenVerifier,
    SsoProviderUnavailableError,
    SsoTokenVerificationError,
    _verifier_key,
)


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


def test_sso_verifier_cache_key_separates_security_relevant_settings():
    base = {
        "secret_key": "test-secret-key-32-chars-minimum-value",
        "auth_mode": "microsoft_sso",
        "entra_tenant_id": "tenant-a",
        "entra_client_id": "client-a",
        "entra_oidc_discovery_url": "https://login.example.test/tenant-a/.well-known/openid-configuration",
        "entra_allowed_email_domains": ["example.com"],
        "entra_business_role_attribute_name": "riskhubBusinessRole",
    }
    base_key = _verifier_key(Settings(**base))

    variants = [
        {"entra_tenant_id": "tenant-b"},
        {"entra_client_id": "client-b"},
        {"entra_oidc_discovery_url": "https://login.other.test/tenant-a/.well-known/openid-configuration"},
        {"entra_allowed_email_domains": ["other.example"]},
        {"entra_business_role_attribute_name": "riskhubBusinessRoleV2"},
        {"entra_clock_skew_seconds": 30},
    ]

    for variant in variants:
        assert _verifier_key(Settings(**{**base, **variant})) != base_key


@pytest.mark.asyncio
async def test_sso_fetch_json_uses_outbound_guard_for_discovery_urls():
    settings = Settings(
        debug=False,
        secret_key="test-secret-key-32-chars-minimum-value",
        auth_mode="microsoft_sso",
        entra_tenant_id="00000000-0000-0000-0000-000000000000",
        entra_client_id="11111111-1111-1111-1111-111111111111",
        entra_oidc_discovery_url="http://127.0.0.1:8080/.well-known/openid-configuration",
    )
    verifier = EntraTokenVerifier(settings=settings)

    with pytest.raises(SsoProviderUnavailableError, match="Private/local outbound destination is blocked"):
        await verifier._fetch_json("http://127.0.0.1:8080/.well-known/openid-configuration")


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
    emitted: dict[str, object] = {}

    def capture_info(event: str, **kwargs: object) -> None:
        emitted["event"] = event
        emitted.update(kwargs)

    monkeypatch.setattr("app.services.sso_token_service.logger.info", capture_info)

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

    # Model an existing cache whose refresh cooldown has elapsed.
    await verifier.prefetch_signing_metadata()
    verifier._jwks_refresh_after = 0
    identity = await verifier.verify_id_token(id_token=token)
    assert identity.external_id == "oid-rotate"
    assert jwks_calls["count"] == 2
    assert emitted["event"] == "jwks_unknown_kid_refresh"
    assert emitted["kid"] == kid


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


@pytest.mark.asyncio
async def test_sso_token_service_logs_signature_failure_refresh(monkeypatch: pytest.MonkeyPatch):
    tenant_id = "00000000-0000-0000-0000-000000000000"
    client_id = "11111111-1111-1111-1111-111111111111"
    discovery_url = "https://example.test/oidc"
    jwks_url = "https://example.test/jwks"
    issuer = f"https://login.microsoftonline.com/{tenant_id}/v2.0"

    signing_priv_pem, signing_public = _make_rsa_keypair()
    stale_priv_pem, stale_public = _make_rsa_keypair()
    kid = "kid-shared"
    signing_jwk = json.loads(RSAAlgorithm.to_jwk(signing_public))
    signing_jwk["kid"] = kid
    stale_jwk = json.loads(RSAAlgorithm.to_jwk(stale_public))
    stale_jwk["kid"] = kid

    now = datetime.now(UTC)
    claims = {
        "iss": issuer,
        "aud": client_id,
        "tid": tenant_id,
        "oid": "oid-signature-refresh",
        "preferred_username": "sig@example.com",
        "exp": int((now + timedelta(minutes=5)).timestamp()),
    }
    token = jwt.encode(claims, signing_priv_pem, algorithm="RS256", headers={"kid": kid})

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

    emitted: dict[str, object] = {}

    def capture_warning(event: str, **kwargs: object) -> None:
        emitted["event"] = event
        emitted.update(kwargs)

    monkeypatch.setattr("app.services.sso_token_service.logger.warning", capture_warning)

    jwks_calls = {"count": 0}

    async def fake_fetch_json(url: str):
        if url == discovery_url:
            return {"issuer": issuer, "jwks_uri": jwks_url}
        if url == jwks_url:
            jwks_calls["count"] += 1
            if jwks_calls["count"] == 1:
                return {"keys": [stale_jwk]}
            return {"keys": [signing_jwk]}
        raise AssertionError(f"Unexpected fetch url: {url}")

    verifier._fetch_json = fake_fetch_json  # type: ignore[method-assign]

    # Model an existing cache whose refresh cooldown has elapsed.
    await verifier.prefetch_signing_metadata()
    verifier._jwks_refresh_after = 0
    identity = await verifier.verify_id_token(id_token=token)
    assert identity.external_id == "oid-signature-refresh"
    assert jwks_calls["count"] == 2
    assert emitted["event"] == "jwks_signature_fail_refresh"
    assert emitted["kid"] == kid


@pytest.mark.asyncio
async def test_sso_token_service_logs_fallback_exhaustion(monkeypatch: pytest.MonkeyPatch):
    tenant_id = "00000000-0000-0000-0000-000000000000"
    client_id = "11111111-1111-1111-1111-111111111111"
    discovery_url = "https://example.test/oidc"
    jwks_url = "https://example.test/jwks"
    issuer = f"https://login.microsoftonline.com/{tenant_id}/v2.0"

    signing_priv_pem, _ = _make_rsa_keypair()
    stale_priv_pem, stale_public = _make_rsa_keypair()
    kid = "kid-stale"
    stale_jwk = json.loads(RSAAlgorithm.to_jwk(stale_public))
    stale_jwk["kid"] = kid

    now = datetime.now(UTC)
    claims = {
        "iss": issuer,
        "aud": client_id,
        "tid": tenant_id,
        "oid": "oid-fallback-exhausted",
        "preferred_username": "fallback@example.com",
        "exp": int((now + timedelta(minutes=5)).timestamp()),
    }
    token = jwt.encode(claims, signing_priv_pem, algorithm="RS256", headers={"kid": kid})

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

    emitted_error: dict[str, object] = {}
    emitted_audit: dict[str, object] = {}

    def capture_error(event: str, **kwargs: object) -> None:
        emitted_error["event"] = event
        emitted_error.update(kwargs)

    def capture_audit_error(event: str, **kwargs: object) -> None:
        emitted_audit["event"] = event
        emitted_audit.update(kwargs)

    monkeypatch.setattr("app.services.sso_token_service.logger.error", capture_error)
    monkeypatch.setattr(audit_logger, "error", capture_audit_error)

    async def fake_fetch_json(url: str):
        if url == discovery_url:
            return {"issuer": issuer, "jwks_uri": jwks_url}
        if url == jwks_url:
            return {"keys": [stale_jwk]}
        raise AssertionError(f"Unexpected fetch url: {url}")

    verifier._fetch_json = fake_fetch_json  # type: ignore[method-assign]

    with pytest.raises(SsoTokenVerificationError) as exc:
        await verifier.verify_id_token(id_token=token)
    assert exc.value.code == "invalid_token"
    assert emitted_error["event"] == "jwks_fallback_exhausted"
    assert emitted_audit["event"] == "jwks_fallback_exhausted"


@pytest.mark.asyncio
async def test_sso_token_service_prefetch_signing_metadata(monkeypatch: pytest.MonkeyPatch):
    tenant_id = "00000000-0000-0000-0000-000000000000"
    client_id = "11111111-1111-1111-1111-111111111111"
    discovery_url = "https://example.test/oidc"
    jwks_url = "https://example.test/jwks"
    issuer = f"https://login.microsoftonline.com/{tenant_id}/v2.0"

    _, public_key = _make_rsa_keypair()
    public_jwk = json.loads(RSAAlgorithm.to_jwk(public_key))
    public_jwk["kid"] = "kid-prefetch"

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

    async def fake_fetch_json(url: str):
        if url == discovery_url:
            return {"issuer": issuer, "jwks_uri": jwks_url}
        if url == jwks_url:
            return {"keys": [public_jwk]}
        raise AssertionError(f"Unexpected fetch url: {url}")

    verifier._fetch_json = fake_fetch_json  # type: ignore[method-assign]

    payload = await verifier.prefetch_signing_metadata()
    assert payload == {"issuer": issuer, "jwks_uri": jwks_url, "key_count": 1}


@pytest.fixture
def cached_signing_metadata(monkeypatch: pytest.MonkeyPatch):
    """Real signed tokens and cached metadata; every network call stays mocked."""
    tenant_id = "00000000-0000-0000-0000-000000000000"
    client_id = "11111111-1111-1111-1111-111111111111"
    issuer = f"https://login.microsoftonline.com/{tenant_id}/v2.0"
    jwks_uri = "https://example.test/jwks"
    private_key, public_key = _make_rsa_keypair()
    public_jwk = json.loads(RSAAlgorithm.to_jwk(public_key))
    public_jwk["kid"] = "cached-key"
    jwks = {"keys": [public_jwk]}
    verifier = EntraTokenVerifier(settings=Settings(
        secret_key="test-secret-key-32-chars-minimum-value",
        auth_mode="microsoft_sso",
        entra_tenant_id=tenant_id,
        entra_client_id=client_id,
    ))
    # Metadata was loaded before the current refresh window.
    verifier._discovery = {"issuer": issuer, "jwks_uri": jwks_uri}
    verifier._discovery_fetched_at = time.monotonic() - verifier.JWKS_REFRESH_INTERVAL_SECONDS
    verifier._jwks = jwks
    verifier._jwks_fetched_at = verifier._discovery_fetched_at

    def make_token(*, kid="cached-key", key=private_key, **overrides):
        now = datetime.now(UTC)
        claims = {
            "iss": issuer,
            "aud": client_id,
            "tid": tenant_id,
            "oid": "cached-user",
            "exp": int((now + timedelta(minutes=5)).timestamp()),
            **overrides,
        }
        return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})

    async def unexpected_network(url):
        raise AssertionError(f"Unexpected network fetch: {url}")

    monkeypatch.setattr(verifier, "_fetch_json", unexpected_network)
    return verifier, make_token, jwks, jwks_uri


@pytest.mark.asyncio
async def test_unknown_kids_share_bounded_negative_cache(cached_signing_metadata, monkeypatch):
    verifier, make_token, jwks, jwks_uri = cached_signing_metadata
    calls = []

    async def fetch(url):
        calls.append(url)
        return jwks

    monkeypatch.setattr(verifier, "_fetch_json", fetch)
    for kid in ("unknown-a", "unknown-a", "unknown-b", "unknown-c"):
        with pytest.raises(SsoTokenVerificationError) as exc:
            await verifier.verify_id_token(id_token=make_token(kid=kid))
        assert exc.value.code == "invalid_token"
    assert calls == [jwks_uri]


@pytest.mark.asyncio
async def test_unknown_kid_on_cold_cache_fetches_jwks_only_once(cached_signing_metadata, monkeypatch):
    verifier, make_token, jwks, jwks_uri = cached_signing_metadata
    verifier._jwks = None
    calls = []

    async def fetch(url):
        calls.append(url)
        return jwks

    monkeypatch.setattr(verifier, "_fetch_json", fetch)
    with pytest.raises(SsoTokenVerificationError):
        await verifier.verify_id_token(id_token=make_token(kid="unknown"))
    assert calls == [jwks_uri]


@pytest.mark.asyncio
async def test_invalid_signatures_do_not_bypass_refresh_cooldown(cached_signing_metadata, monkeypatch):
    verifier, make_token, jwks, jwks_uri = cached_signing_metadata
    wrong_private_key, _ = _make_rsa_keypair()
    calls = []

    async def fetch(url):
        calls.append(url)
        return jwks

    monkeypatch.setattr(verifier, "_fetch_json", fetch)
    for _ in range(3):
        with pytest.raises(SsoTokenVerificationError) as exc:
            await verifier.verify_id_token(id_token=make_token(key=wrong_private_key))
        assert exc.value.code == "invalid_token"
    assert calls == [jwks_uri]


@pytest.mark.asyncio
@pytest.mark.parametrize("claims", [
    {"exp": 0},
    {"aud": "wrong-client"},
    {"iss": "https://wrong-issuer.test"},
    {"nbf": 9999999999},
])
async def test_invalid_claims_do_not_refresh_jwks(cached_signing_metadata, claims):
    verifier, make_token, _, _ = cached_signing_metadata
    with pytest.raises(SsoTokenVerificationError) as exc:
        await verifier.verify_id_token(id_token=make_token(**claims))
    assert exc.value.code == "invalid_token"


@pytest.mark.asyncio
async def test_disallowed_algorithm_does_not_refresh_jwks(cached_signing_metadata):
    verifier, _, _, _ = cached_signing_metadata
    token = jwt.encode(
        {}, "synthetic-hmac-key-with-at-least-32-bytes", algorithm="HS256", headers={"kid": "cached-key"}
    )
    with pytest.raises(SsoTokenVerificationError) as exc:
        await verifier.verify_id_token(id_token=token)
    assert exc.value.code == "invalid_token"


@pytest.mark.asyncio
@pytest.mark.parametrize("kid", ["new-key", "cached-key"])
async def test_rotation_recovers_after_cooldown(cached_signing_metadata, monkeypatch, kid):
    verifier, make_token, jwks, jwks_uri = cached_signing_metadata
    rotated_private, rotated_public = _make_rsa_keypair()
    rotated_jwk = json.loads(RSAAlgorithm.to_jwk(rotated_public))
    rotated_jwk["kid"] = kid
    response = jwks
    calls = []

    async def fetch(url):
        calls.append(url)
        return response

    monkeypatch.setattr(verifier, "_fetch_json", fetch)
    await verifier.prefetch_signing_metadata()
    response = {"keys": [rotated_jwk]}
    token = make_token(kid=kid, key=rotated_private)
    with pytest.raises(SsoTokenVerificationError):
        await verifier.verify_id_token(id_token=token)
    assert calls == [jwks_uri]

    verifier._jwks_refresh_after = 0  # Elapse the cooldown without sleeping.
    identity = await verifier.verify_id_token(id_token=token)
    assert identity.external_id == "cached-user"
    assert calls == [jwks_uri, jwks_uri]


@pytest.mark.asyncio
async def test_concurrent_unknown_keys_share_refresh_without_blocking_cached_keys(cached_signing_metadata, monkeypatch):
    verifier, make_token, jwks, jwks_uri = cached_signing_metadata
    fetch_started = asyncio.Event()
    release_fetch = asyncio.Event()
    calls = []

    async def fetch(url):
        calls.append(url)
        fetch_started.set()
        await release_fetch.wait()
        return jwks

    monkeypatch.setattr(verifier, "_fetch_json", fetch)
    pending = [asyncio.create_task(verifier.verify_id_token(id_token=make_token(kid=f"unknown-{i}"))) for i in range(5)]
    try:
        await asyncio.wait_for(fetch_started.wait(), timeout=1)
        identity = await asyncio.wait_for(verifier.verify_id_token(id_token=make_token()), timeout=1)
        assert identity.external_id == "cached-user"
    finally:
        release_fetch.set()
        outcomes = await asyncio.gather(*pending, return_exceptions=True)
    assert all(isinstance(outcome, SsoTokenVerificationError) for outcome in outcomes)
    assert calls == [jwks_uri]


@pytest.mark.asyncio
@pytest.mark.parametrize("has_cache", [True, False])
@pytest.mark.parametrize("bad_payload", [True, False])
async def test_unavailable_jwks_does_not_retry_each_request(
    cached_signing_metadata, monkeypatch, has_cache, bad_payload
):
    verifier, make_token, jwks, jwks_uri = cached_signing_metadata
    verifier._jwks = jwks if has_cache else None
    verifier._jwks_fetched_at = -verifier.JWKS_TTL_SECONDS  # Expired caches are not accepted.
    calls = []

    async def fetch(url):
        calls.append(url)
        if bad_payload:
            return {"invalid": "payload"}
        raise SsoProviderUnavailableError("Simulated provider outage")

    monkeypatch.setattr(verifier, "_fetch_json", fetch)
    for _ in range(3):
        with pytest.raises(SsoProviderUnavailableError):
            await verifier.verify_id_token(id_token=make_token())
    assert calls == [jwks_uri]

    async def recovered_fetch(url):
        calls.append(url)
        return jwks

    monkeypatch.setattr(verifier, "_fetch_json", recovered_fetch)
    verifier._jwks_refresh_after = 0
    identity = await verifier.verify_id_token(id_token=make_token())
    assert identity.external_id == "cached-user"
    assert calls == [jwks_uri, jwks_uri]


@pytest.mark.asyncio
async def test_prefetch_respects_shared_cooldown(cached_signing_metadata, monkeypatch):
    verifier, _, jwks, jwks_uri = cached_signing_metadata
    calls = []

    async def fetch(url):
        calls.append(url)
        return jwks

    monkeypatch.setattr(verifier, "_fetch_json", fetch)
    await verifier.prefetch_signing_metadata()
    await verifier.prefetch_signing_metadata()
    assert calls == [jwks_uri]


@pytest.mark.asyncio
async def test_failed_forced_refresh_preserves_unexpired_keys(cached_signing_metadata, monkeypatch):
    verifier, make_token, _, jwks_uri = cached_signing_metadata
    calls = []

    async def fetch(url):
        calls.append(url)
        raise SsoProviderUnavailableError("Simulated provider outage")

    monkeypatch.setattr(verifier, "_fetch_json", fetch)
    with pytest.raises(SsoProviderUnavailableError):
        await verifier.verify_id_token(id_token=make_token(kid="unknown"))
    with pytest.raises(SsoTokenVerificationError):
        await verifier.verify_id_token(id_token=make_token(kid="other-unknown"))
    identity = await verifier.verify_id_token(id_token=make_token())
    assert identity.external_id == "cached-user"
    assert calls == [jwks_uri]
