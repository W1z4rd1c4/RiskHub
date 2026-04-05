from __future__ import annotations

import asyncio
import hashlib
import importlib
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import EntraConfidentialCredential, Settings
from app.core.email import normalize_email
from app.core.outbound_guard import (
    OutboundRequestError,
    build_outbound_client,
    guard_outbound_url,
    guard_resolved_outbound_url,
    guarded_get,
)
from app.schemas.directory import DirectoryUserRead
from app.services.directory_identity_service import normalize_business_role

_GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
_GRAPH_SCOPE = "https://graph.microsoft.com/.default"


@dataclass
class _GraphTokenCacheEntry:
    token: str | None = None
    expiry: datetime | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_GRAPH_TOKEN_CACHE: dict[str, _GraphTokenCacheEntry] = {}


class GraphDirectoryProviderError(RuntimeError):
    """Base error for Graph directory provider failures."""


class GraphProviderUnavailableError(GraphDirectoryProviderError):
    """Raised when Graph cannot be used because of config/network/auth failures."""


class GraphUserNotFoundError(GraphDirectoryProviderError):
    """Raised when a specific directory user does not exist."""


class GraphDirectoryService:
    """Microsoft Graph directory client using client-credentials flow."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._token: str | None = None
        self._token_expiry: datetime | None = None

    @property
    def source_name(self) -> str:
        return "graph"

    def _user_select_fields(self) -> str:
        fields = ["id", "displayName", "mail", "userPrincipalName", "department", "jobTitle", "accountEnabled"]
        business_role_field = self._settings.entra_business_role_graph_field
        if business_role_field:
            fields.append(business_role_field)
        return ",".join(fields)

    async def search_users(self, *, query: str, limit: int = 25, skip: int = 0) -> list[DirectoryUserRead]:
        q = query.strip()
        if not q:
            return []
        safe_q = q.replace("'", "''")
        params = {
            "$select": self._user_select_fields(),
            "$filter": (
                f"startswith(displayName,'{safe_q}')"
                f" or startswith(mail,'{safe_q}')"
                f" or startswith(userPrincipalName,'{safe_q}')"
            ),
            "$top": str(max(1, min(limit, 50))),
            "$skip": str(max(skip, 0)),
        }
        payload = await self._graph_get("/users", params=params)
        items = payload.get("value", [])
        if not isinstance(items, list):
            return []
        return [self._to_directory_user(row) for row in items if isinstance(row, dict)]

    async def get_user(self, external_id: str) -> DirectoryUserRead:
        oid = external_id.strip()
        if not oid:
            raise GraphUserNotFoundError("Missing directory object id")
        payload = await self._graph_get(
            f"/users/{oid}",
            params={"$select": self._user_select_fields()},
            not_found_is_error=True,
        )
        return self._to_directory_user(payload)

    async def find_user_by_login_identifier(self, identifier: str) -> list[DirectoryUserRead]:
        normalized = normalize_email(identifier)
        if normalized is None:
            return []
        safe_identifier = normalized.replace("'", "''")
        params = {
            "$select": self._user_select_fields(),
            "$filter": f"mail eq '{safe_identifier}' or userPrincipalName eq '{safe_identifier}'",
            "$top": "5",
        }
        payload = await self._graph_get("/users", params=params)
        items = payload.get("value", [])
        if not isinstance(items, list):
            return []
        matches = [self._to_directory_user(row) for row in items if isinstance(row, dict)]
        return [
            row for row in matches
            if normalize_email(row.email) == normalized or normalize_email(row.user_principal_name) == normalized
        ]

    async def _graph_get(
        self,
        path: str,
        *,
        params: dict[str, str] | None = None,
        not_found_is_error: bool = False,
    ) -> dict[str, Any]:
        token = await self._get_access_token()
        headers = {"Authorization": f"Bearer {token}"}
        url = f"{_GRAPH_BASE_URL}{path}"
        try:
            guard_outbound_url(url=url, settings=self._settings, allowed_hosts=["graph.microsoft.com"])
        except OutboundRequestError as exc:
            raise GraphProviderUnavailableError(str(exc)) from exc

        async with build_outbound_client(
            settings=self._settings,
            timeout_seconds=self._settings.graph_timeout_seconds,
        ) as client:
            try:
                response = await guarded_get(
                    client,
                    url=url,
                    settings=self._settings,
                    allowed_hosts=["graph.microsoft.com"],
                    headers=headers,
                    params=params,
                )
            except (httpx.HTTPError, OutboundRequestError) as exc:
                raise GraphProviderUnavailableError(f"Graph request failed: {exc}") from exc

        if response.status_code == 404 and not_found_is_error:
            raise GraphUserNotFoundError("Directory user not found")
        if response.status_code in (401, 403):
            raise GraphProviderUnavailableError("Graph access denied")
        if response.status_code >= 500:
            raise GraphProviderUnavailableError("Graph service unavailable")
        if response.status_code >= 400:
            detail = response.text[:200]
            raise GraphDirectoryProviderError(f"Graph request failed ({response.status_code}): {detail}")

        payload: dict[str, Any] = response.json()
        return payload

    async def _get_access_token(self) -> str:
        tenant_id = self._settings.entra_tenant_id
        client_id = self._settings.entra_client_id
        if not tenant_id or not client_id:
            raise GraphProviderUnavailableError(
                "Graph credentials are not configured (ENTRA_TENANT_ID, ENTRA_CLIENT_ID, and an Entra Graph credential)."
            )

        if self._settings.entra_certificate_credential_error:
            raise GraphProviderUnavailableError(self._settings.entra_certificate_credential_error)

        credential = self._settings.entra_confidential_credential
        if credential is None:
            raise GraphProviderUnavailableError(
                "Graph credentials are not configured (ENTRA_TENANT_ID, ENTRA_CLIENT_ID, and an Entra Graph credential)."
            )

        cache_key = self._build_token_cache_key(
            tenant_id=tenant_id,
            client_id=client_id,
            credential=credential,
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
                int(expires_in)
                if isinstance(expires_in, int | float | str) and str(expires_in).isdigit()
                else 3600
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
            raise GraphProviderUnavailableError(
                "MSAL Python is not installed; cannot acquire Graph token."
            ) from exc

        authority = f"https://login.microsoftonline.com/{tenant_id}"
        client_credential: str | dict[str, str]
        if credential.mode == "certificate":
            if not credential.client_certificate_private_key or not credential.client_certificate_thumbprint:
                raise GraphProviderUnavailableError("Graph certificate credential is incomplete")
            client_credential = {
                "private_key": credential.client_certificate_private_key,
                "thumbprint": credential.client_certificate_thumbprint,
            }
        else:
            if not credential.client_secret:
                raise GraphProviderUnavailableError("Graph client secret credential is missing")
            client_credential = credential.client_secret

        try:
            app = msal.ConfidentialClientApplication(  # type: ignore[attr-defined]
                client_id=client_id,
                authority=authority,
                client_credential=client_credential,
            )
            result = await self._run_in_thread(app.acquire_token_for_client, scopes=[_GRAPH_SCOPE])
        except Exception as exc:  # pragma: no cover - explicit third-party dependency boundary
            raise GraphProviderUnavailableError(f"Failed to acquire Graph token: {exc}") from exc

        if not isinstance(result, dict):
            raise GraphProviderUnavailableError("Graph token response is invalid")
        if "access_token" in result:
            return result

        detail = result.get("error_description") or result.get("error") or "unknown error"
        raise GraphProviderUnavailableError(f"Failed to acquire Graph token: {detail}")

    async def _run_in_thread(self, fn, *args, **kwargs):
        import asyncio

        return await asyncio.to_thread(fn, *args, **kwargs)

    @staticmethod
    def _build_token_cache_key(
        *,
        tenant_id: str,
        client_id: str,
        credential: EntraConfidentialCredential,
    ) -> str:
        fingerprint = hashlib.sha256()
        fingerprint.update(tenant_id.encode("utf-8"))
        fingerprint.update(b"\0")
        fingerprint.update(client_id.encode("utf-8"))
        fingerprint.update(b"\0")
        fingerprint.update(credential.mode.encode("utf-8"))
        if credential.client_secret:
            fingerprint.update(b"\0")
            fingerprint.update(credential.client_secret.encode("utf-8"))
        if credential.client_certificate_thumbprint:
            fingerprint.update(b"\0")
            fingerprint.update(credential.client_certificate_thumbprint.encode("utf-8"))
        if credential.client_certificate_private_key:
            fingerprint.update(b"\0")
            fingerprint.update(credential.client_certificate_private_key.encode("utf-8"))
        return fingerprint.hexdigest()

    def _to_directory_user(self, payload: dict[str, Any]) -> DirectoryUserRead:
        oid = payload.get("id")
        if not isinstance(oid, str) or not oid:
            raise GraphDirectoryProviderError("Graph user payload missing id")

        display_name_raw = payload.get("displayName")
        display_name = display_name_raw.strip() if isinstance(display_name_raw, str) else ""
        if not display_name:
            display_name = oid

        mail_raw = payload.get("mail")
        upn_raw = payload.get("userPrincipalName")
        department_raw = payload.get("department")
        job_title_raw = payload.get("jobTitle")
        business_role_raw = payload.get(self._settings.entra_business_role_graph_field or "")
        account_enabled = payload.get("accountEnabled")

        return DirectoryUserRead(
            external_id=oid,
            display_name=display_name,
            email=mail_raw.strip().lower() if isinstance(mail_raw, str) and mail_raw.strip() else None,
            user_principal_name=upn_raw.strip().lower() if isinstance(upn_raw, str) and upn_raw.strip() else None,
            department=department_raw.strip() if isinstance(department_raw, str) and department_raw.strip() else None,
            job_title=job_title_raw.strip() if isinstance(job_title_raw, str) and job_title_raw.strip() else None,
            business_role=normalize_business_role(business_role_raw if isinstance(business_role_raw, str) else None),
            account_enabled=bool(account_enabled) if isinstance(account_enabled, bool) else True,
            source="graph",
        )


def __reset_graph_token_cache_for_tests() -> None:
    _GRAPH_TOKEN_CACHE.clear()
