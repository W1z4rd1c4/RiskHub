from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from jwt import PyJWTError

from app.core.config import Settings
from app.core.outbound_guard import (
    OutboundRequestError,
    build_outbound_client,
    extract_host,
    guard_outbound_url,
)


class SsoTokenVerificationError(Exception):
    def __init__(self, *, code: str, detail: str):
        super().__init__(detail)
        self.code = code


class SsoProviderUnavailableError(Exception):
    pass


@dataclass(frozen=True)
class VerifiedIdentity:
    external_id: str
    tenant_id: str
    email: str | None
    name: str | None


def _normalize_email(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    return normalized or None


def _jwks_has_kid(jwks: dict[str, Any], kid: str) -> bool:
    keys = jwks.get("keys")
    if not isinstance(keys, list):
        return False
    return any(isinstance(k, dict) and k.get("kid") == kid for k in keys)


def _extract_kid(token: str) -> str | None:
    try:
        header = jwt.get_unverified_header(token)
    except (PyJWTError, ValueError, TypeError):
        return None
    if not isinstance(header, dict):
        return None
    kid = header.get("kid")
    if isinstance(kid, str) and kid:
        return kid
    return None


class EntraTokenVerifier:
    DISCOVERY_TTL_SECONDS = 60 * 60 * 24  # 24h
    JWKS_TTL_SECONDS = 60 * 60  # 1h

    def __init__(self, *, settings: Settings):
        if not settings.entra_tenant_id or not settings.entra_client_id:
            raise SsoProviderUnavailableError("Missing Entra configuration")
        self._settings = settings
        self._tenant_id = settings.entra_tenant_id
        self._client_id = settings.entra_client_id
        self._allowed_domains = [d.strip().lower() for d in settings.entra_allowed_email_domains if d.strip()]
        self._clock_skew_seconds = int(settings.entra_clock_skew_seconds or 0)
        self._discovery_url = (
            settings.entra_oidc_discovery_url
            or f"https://login.microsoftonline.com/{self._tenant_id}/v2.0/.well-known/openid-configuration"
        )
        self._discovery_host = extract_host(self._discovery_url)

        self._lock = asyncio.Lock()
        self._discovery: dict[str, Any] | None = None
        self._discovery_fetched_at: float = 0.0
        self._jwks: dict[str, Any] | None = None
        self._jwks_fetched_at: float = 0.0

    async def _fetch_json(self, url: str) -> dict[str, Any]:
        allow_hosts = [self._discovery_host] if self._discovery_host else None
        try:
            guard_outbound_url(url=url, settings=self._settings, allowed_hosts=allow_hosts)
        except OutboundRequestError as exc:
            raise SsoProviderUnavailableError(str(exc)) from exc
        try:
            async with build_outbound_client(settings=self._settings, timeout_seconds=10.0) as client:
                res = await client.get(url)
                res.raise_for_status()
                data = res.json()
                if not isinstance(data, dict):
                    raise ValueError("Expected JSON object")
                return data
        except (httpx.HTTPError, ValueError, TypeError) as e:
            raise SsoProviderUnavailableError(str(e)) from e

    async def _get_discovery(self, *, now: float) -> dict[str, Any]:
        async with self._lock:
            if self._discovery and (now - self._discovery_fetched_at) < self.DISCOVERY_TTL_SECONDS:
                return self._discovery
            discovery = await self._fetch_json(self._discovery_url)
            issuer = discovery.get("issuer")
            jwks_uri = discovery.get("jwks_uri")
            if not issuer or not jwks_uri:
                raise SsoProviderUnavailableError("OIDC discovery missing issuer/jwks_uri")
            allowed_hosts: list[str] = []
            if self._discovery_host:
                allowed_hosts.append(self._discovery_host)
            issuer_host = extract_host(str(issuer))
            if issuer_host:
                allowed_hosts.append(issuer_host)
            try:
                guard_outbound_url(
                    url=str(jwks_uri),
                    settings=self._settings,
                    allowed_hosts=allowed_hosts or None,
                )
            except OutboundRequestError as exc:
                raise SsoProviderUnavailableError(str(exc)) from exc
            self._discovery = discovery
            self._discovery_fetched_at = now
            return discovery

    async def _get_jwks(self, *, jwks_uri: str, now: float, force_refresh: bool = False) -> dict[str, Any]:
        async with self._lock:
            if not force_refresh and self._jwks and (now - self._jwks_fetched_at) < self.JWKS_TTL_SECONDS:
                return self._jwks
            jwks = await self._fetch_json(jwks_uri)
            if not isinstance(jwks.get("keys"), list):
                raise SsoProviderUnavailableError("JWKS payload missing keys")
            self._jwks = jwks
            self._jwks_fetched_at = now
            return jwks

    def _decode_claims(self, *, id_token: str, jwks: dict[str, Any], issuer: str, kid: str | None) -> dict[str, Any]:
        try:
            jwk_set = jwt.PyJWKSet.from_dict(jwks)
        except (PyJWTError, ValueError, TypeError) as e:
            raise SsoProviderUnavailableError(f"Invalid JWKS payload: {e}") from e

        candidates = list(jwk_set.keys)
        if kid:
            candidates = [key for key in candidates if key.key_id == kid]
            if not candidates:
                raise PyJWTError(f"No signing key found for kid: {kid}")

        last_error: Exception | None = None
        for candidate in candidates:
            try:
                return jwt.decode(
                    id_token,
                    candidate.key,
                    algorithms=["RS256"],
                    audience=self._client_id,
                    issuer=issuer,
                    leeway=self._clock_skew_seconds,
                )
            except PyJWTError as e:
                last_error = e

        if last_error:
            raise last_error
        raise PyJWTError("No signing keys available in JWKS")

    async def verify_id_token(self, *, id_token: str) -> VerifiedIdentity:
        if not id_token:
            raise SsoTokenVerificationError(code="missing_token", detail="Missing id_token")

        now = asyncio.get_running_loop().time()
        discovery = await self._get_discovery(now=now)
        issuer = str(discovery["issuer"])
        jwks_uri = str(discovery["jwks_uri"])
        jwks = await self._get_jwks(jwks_uri=jwks_uri, now=now)

        kid = _extract_kid(id_token)

        # If we can see the kid and it's not in our JWKS cache, refresh once.
        if kid and not _jwks_has_kid(jwks, kid):
            jwks = await self._get_jwks(jwks_uri=jwks_uri, now=now, force_refresh=True)

        try:
            claims = self._decode_claims(id_token=id_token, jwks=jwks, issuer=issuer, kid=kid)
        except PyJWTError as e:
            # Best-effort refresh on signature-related failures (key rotation).
            if kid:
                jwks = await self._get_jwks(jwks_uri=jwks_uri, now=now, force_refresh=True)
                try:
                    claims = self._decode_claims(id_token=id_token, jwks=jwks, issuer=issuer, kid=kid)
                except PyJWTError as refreshed_error:
                    raise SsoTokenVerificationError(code="invalid_token", detail=str(refreshed_error)) from e
            else:
                raise SsoTokenVerificationError(code="invalid_token", detail=str(e)) from e

        tenant_id = claims.get("tid")
        if tenant_id != self._tenant_id:
            raise SsoTokenVerificationError(code="tenant_mismatch", detail="Token tenant mismatch")

        external_id = claims.get("oid")
        if not external_id or not isinstance(external_id, str):
            raise SsoTokenVerificationError(code="missing_oid", detail="Token missing oid")

        email = _normalize_email(
            claims.get("preferred_username")
            or claims.get("upn")
            or claims.get("email")
        )

        if self._allowed_domains:
            if not email or "@" not in email:
                raise SsoTokenVerificationError(code="email_required", detail="Email required for domain allowlist")
            domain = email.split("@", 1)[1].lower()
            if domain not in self._allowed_domains:
                raise SsoTokenVerificationError(code="email_domain_not_allowed", detail="Email domain not allowed")

        name = claims.get("name")
        if not name:
            given = claims.get("given_name")
            family = claims.get("family_name")
            candidate = " ".join([str(p).strip() for p in [given, family] if p])
            name = candidate or None
        if name is not None and not isinstance(name, str):
            name = None

        return VerifiedIdentity(
            external_id=external_id,
            tenant_id=self._tenant_id,
            email=email,
            name=name,
        )


_verifier_cache: dict[tuple[str, str, str, int, tuple[str, ...]], EntraTokenVerifier] = {}


def _verifier_key(settings: Settings) -> tuple[str, str, str, int, tuple[str, ...]]:
    tenant_id = settings.entra_tenant_id or ""
    client_id = settings.entra_client_id or ""
    discovery_url = settings.entra_oidc_discovery_url or ""
    clock_skew = int(settings.entra_clock_skew_seconds or 0)
    allowed = tuple(sorted(d.strip().lower() for d in settings.entra_allowed_email_domains if d.strip()))
    return (tenant_id, client_id, discovery_url, clock_skew, allowed)


def _get_verifier(settings: Settings) -> EntraTokenVerifier:
    key = _verifier_key(settings)
    verifier = _verifier_cache.get(key)
    if verifier is None:
        verifier = EntraTokenVerifier(settings=settings)
        _verifier_cache[key] = verifier
    return verifier


async def verify_entra_id_token(*, id_token: str, settings: Settings) -> VerifiedIdentity:
    verifier = _get_verifier(settings)
    return await verifier.verify_id_token(id_token=id_token)
