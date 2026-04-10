from __future__ import annotations

import asyncio
import hashlib
import importlib
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.config import EntraConfidentialCredential, Settings
from app.core.outbound_guard import OutboundRequestError, guard_resolved_outbound_url
from app.services.graph_directory_errors import (
    GraphCredentialError,
    GraphDependencyError,
    GraphProviderUnavailableError,
    GraphTokenAcquisitionError,
    GraphTransientError,
)

_GRAPH_SCOPE = "https://graph.microsoft.com/.default"


@dataclass
class _GraphTokenCacheEntry:
    token: str | None = None
    expiry: datetime | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_GRAPH_TOKEN_CACHE: dict[str, _GraphTokenCacheEntry] = {}


class GraphAccessTokenProvider:
    """Acquire and cache Microsoft Graph client-credential access tokens."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._token: str | None = None
        self._token_expiry: datetime | None = None

    async def get_access_token(self) -> str:
        tenant_id = self._settings.entra_tenant_id
        client_id = self._settings.entra_client_id
        if not tenant_id or not client_id:
            raise GraphCredentialError(
                "Graph credentials are not configured "
                "(ENTRA_TENANT_ID, ENTRA_CLIENT_ID, and an Entra Graph credential)."
            )

        if self._settings.entra_certificate_credential_error:
            raise GraphCredentialError(self._settings.entra_certificate_credential_error)

        credential = self._settings.entra_confidential_credential
        if credential is None:
            raise GraphCredentialError(
                "Graph credentials are not configured "
                "(ENTRA_TENANT_ID, ENTRA_CLIENT_ID, and an Entra Graph credential)."
            )

        cache_key = self.build_token_cache_key(
            tenant_id=tenant_id,
            client_id=client_id,
            credential=credential,
            credential_fingerprint=self._settings.entra_credential_fingerprint,
        )
        cache_entry = _GRAPH_TOKEN_CACHE.setdefault(cache_key, _GraphTokenCacheEntry())
        now = datetime.now(UTC)
        if cache_entry.token and cache_entry.expiry and now < cache_entry.expiry - timedelta(seconds=60):
            self._token = cache_entry.token
            self._token_expiry = cache_entry.expiry
            return cache_entry.token

        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        try:
            await guard_resolved_outbound_url(
                url=token_url,
                settings=self._settings,
                allowed_hosts=["login.microsoftonline.com"],
            )
        except OutboundRequestError as exc:
            raise GraphProviderUnavailableError(str(exc)) from exc

        async with cache_entry.lock:
            now = datetime.now(UTC)
            if cache_entry.token and cache_entry.expiry and now < cache_entry.expiry - timedelta(seconds=60):
                self._token = cache_entry.token
                self._token_expiry = cache_entry.expiry
                return cache_entry.token

            payload = await self._acquire_graph_token_with_msal(
                tenant_id=tenant_id,
                client_id=client_id,
                credential=credential,
            )
            access_token = payload.get("access_token")
            expires_in = payload.get("expires_in")
            if not isinstance(access_token, str) or not access_token:
                raise GraphProviderUnavailableError("Graph token response missing access_token")

            lifetime = (
                int(expires_in) if isinstance(expires_in, (int, float, str)) and str(expires_in).isdigit() else 3600
            )
            expiry = now + timedelta(seconds=max(lifetime, 60))
            cache_entry.token = access_token
            cache_entry.expiry = expiry
            self._token = access_token
            self._token_expiry = expiry
            return access_token

    async def _acquire_graph_token_with_msal(
        self,
        *,
        tenant_id: str,
        client_id: str,
        credential: EntraConfidentialCredential,
    ) -> dict[str, Any]:
        try:
            msal = importlib.import_module("msal")
        except ModuleNotFoundError as exc:
            raise GraphDependencyError("MSAL Python is not installed; cannot acquire Graph token.") from exc

        authority = f"https://login.microsoftonline.com/{tenant_id}"
        client_credential: str | dict[str, str]
        if credential.mode == "certificate":
            if not credential.client_certificate_private_key or not credential.client_certificate_thumbprint:
                raise GraphCredentialError("Graph certificate credential is incomplete")
            client_credential = {
                "private_key": credential.client_certificate_private_key,
                "thumbprint": credential.client_certificate_thumbprint,
            }
        else:
            if not credential.client_secret:
                raise GraphCredentialError("Graph client secret credential is missing")
            client_credential = credential.client_secret

        try:
            app = msal.ConfidentialClientApplication(  # type: ignore[attr-defined]
                client_id=client_id,
                authority=authority,
                client_credential=client_credential,
            )
        except (TypeError, ValueError) as exc:
            raise GraphCredentialError(f"Failed to configure Graph credentials: {exc}") from exc

        try:
            result = await self._run_in_thread(app.acquire_token_for_client, scopes=[_GRAPH_SCOPE])
        except OSError as exc:
            raise GraphTransientError(f"Transient Graph token acquisition failure: {exc}") from exc
        except Exception as exc:  # pragma: no cover - explicit third-party dependency boundary
            raise GraphTokenAcquisitionError(f"Failed to acquire Graph token: {exc}") from exc

        if not isinstance(result, dict):
            raise GraphTokenAcquisitionError("Graph token response is invalid")
        if "access_token" in result:
            return result

        detail = result.get("error_description") or result.get("error") or "unknown error"
        raise GraphTokenAcquisitionError(f"Failed to acquire Graph token: {detail}")

    async def _run_in_thread(self, fn, *args, **kwargs):
        return await asyncio.to_thread(fn, *args, **kwargs)

    @staticmethod
    def build_token_cache_key(
        *,
        tenant_id: str,
        client_id: str,
        credential: EntraConfidentialCredential,
        credential_fingerprint: str | None = None,
    ) -> str:
        fingerprint = hashlib.sha256()
        fingerprint.update(tenant_id.encode("utf-8"))
        fingerprint.update(b"\0")
        fingerprint.update(client_id.encode("utf-8"))
        fingerprint.update(b"\0")
        fingerprint.update(credential.mode.encode("utf-8"))
        fingerprint.update(b"\0")
        fingerprint.update((credential_fingerprint or "").encode("utf-8"))
        if credential.client_certificate_thumbprint:
            fingerprint.update(b"\0")
            fingerprint.update(credential.client_certificate_thumbprint.encode("utf-8"))
        return fingerprint.hexdigest()


def reset_graph_token_cache_for_tests() -> None:
    _GRAPH_TOKEN_CACHE.clear()
