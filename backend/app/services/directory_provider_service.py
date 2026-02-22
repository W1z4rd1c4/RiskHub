from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

import httpx

from app.core.config import Settings
from app.core.outbound_guard import (
    OutboundRequestError,
    build_outbound_client,
    extract_host,
    guard_outbound_url,
)
from app.schemas.directory import DirectoryUserRead
from app.services.graph_directory_service import (
    GraphDirectoryProviderError,
    GraphDirectoryService,
    GraphProviderUnavailableError,
    GraphUserNotFoundError,
)


class DirectoryProviderError(RuntimeError):
    """Base error for directory provider failures."""


class DirectoryProviderUnavailableError(DirectoryProviderError):
    """Raised when no usable directory provider is configured or reachable."""


class DirectoryUserNotFoundError(DirectoryProviderError):
    """Raised when a requested directory user does not exist."""


class _ADEmulatorDirectoryService:
    """Optional dev fallback provider backed by an AD emulator HTTP API."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._base_url = (settings.ad_emulator_base_url or "").rstrip("/")
        self._base_host = extract_host(self._base_url) if self._base_url else None

    @property
    def source_name(self) -> str:
        return "ad_emulator"

    async def search_users(self, *, query: str, limit: int = 25, skip: int = 0) -> list[DirectoryUserRead]:
        if not self._base_url:
            raise DirectoryProviderUnavailableError("AD emulator base URL is not configured")

        payload = await self._get_json(
            "/users/search",
            params={"q": query, "limit": str(max(1, min(limit, 50))), "skip": str(max(skip, 0))},
        )
        records = payload.get("users")
        if not isinstance(records, list):
            records = payload.get("value")
        if not isinstance(records, list):
            return []
        return [self._to_directory_user(row) for row in records if isinstance(row, dict)]

    async def get_user(self, external_id: str) -> DirectoryUserRead:
        if not self._base_url:
            raise DirectoryProviderUnavailableError("AD emulator base URL is not configured")
        payload = await self._get_json(f"/users/{external_id.strip()}", not_found_is_error=True)
        return self._to_directory_user(payload)

    async def _get_json(
        self,
        path: str,
        *,
        params: dict[str, str] | None = None,
        not_found_is_error: bool = False,
    ) -> dict[str, Any]:
        url = urljoin(f"{self._base_url}/", path.lstrip("/"))
        try:
            guard_outbound_url(
                url=url,
                settings=self._settings,
                allowed_hosts=([self._base_host] if self._base_host else None),
            )
        except OutboundRequestError as exc:
            raise DirectoryProviderUnavailableError(str(exc)) from exc

        headers: dict[str, str] = {}
        if self._settings.ad_emulator_api_key:
            headers[self._settings.ad_emulator_api_key_header] = self._settings.ad_emulator_api_key
        async with build_outbound_client(
            settings=self._settings,
            timeout_seconds=self._settings.graph_timeout_seconds,
        ) as client:
            try:
                response = await client.get(url, params=params, headers=headers)
            except httpx.HTTPError as exc:
                raise DirectoryProviderUnavailableError(f"AD emulator request failed: {exc}") from exc

        if response.status_code == 404 and not_found_is_error:
            raise DirectoryUserNotFoundError("Directory user not found")
        if response.status_code in (401, 403):
            raise DirectoryProviderUnavailableError("AD emulator access denied")
        if response.status_code >= 500:
            raise DirectoryProviderUnavailableError("AD emulator unavailable")
        if response.status_code >= 400:
            raise DirectoryProviderError(
                f"AD emulator request failed ({response.status_code}): {response.text[:200]}"
            )

        payload: dict[str, Any] = response.json()
        return payload

    def _to_directory_user(self, payload: dict[str, Any]) -> DirectoryUserRead:
        oid = payload.get("external_id") or payload.get("id") or payload.get("oid")
        if not isinstance(oid, str) or not oid.strip():
            raise DirectoryProviderError("AD emulator payload missing user id")

        display_name_raw = payload.get("display_name") or payload.get("displayName")
        display_name = display_name_raw.strip() if isinstance(display_name_raw, str) else ""
        if not display_name:
            display_name = oid

        email_raw = payload.get("email") or payload.get("mail")
        upn_raw = payload.get("user_principal_name") or payload.get("userPrincipalName")
        department_raw = payload.get("department")
        job_title_raw = payload.get("job_title") or payload.get("jobTitle")
        account_enabled_raw = payload.get("account_enabled")

        return DirectoryUserRead(
            external_id=oid.strip(),
            display_name=display_name,
            email=email_raw.strip().lower() if isinstance(email_raw, str) and email_raw.strip() else None,
            user_principal_name=upn_raw.strip().lower() if isinstance(upn_raw, str) and upn_raw.strip() else None,
            department=department_raw.strip() if isinstance(department_raw, str) and department_raw.strip() else None,
            job_title=job_title_raw.strip() if isinstance(job_title_raw, str) and job_title_raw.strip() else None,
            account_enabled=bool(account_enabled_raw) if isinstance(account_enabled_raw, bool) else True,
            source="ad_emulator",
        )


class DirectoryProviderService:
    """Provider-agnostic directory access facade."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._provider = self._build_provider(settings)

    @property
    def provider_name(self) -> str:
        return self._provider.source_name

    async def search_users(self, *, query: str, limit: int = 25, skip: int = 0) -> list[DirectoryUserRead]:
        try:
            return await self._provider.search_users(query=query, limit=limit, skip=skip)
        except GraphProviderUnavailableError as exc:
            raise DirectoryProviderUnavailableError(str(exc)) from exc
        except GraphDirectoryProviderError as exc:
            raise DirectoryProviderError(str(exc)) from exc

    async def get_user(self, external_id: str) -> DirectoryUserRead:
        try:
            return await self._provider.get_user(external_id=external_id)
        except GraphUserNotFoundError as exc:
            raise DirectoryUserNotFoundError(str(exc)) from exc
        except GraphProviderUnavailableError as exc:
            raise DirectoryProviderUnavailableError(str(exc)) from exc
        except GraphDirectoryProviderError as exc:
            raise DirectoryProviderError(str(exc)) from exc

    def _build_provider(self, settings: Settings) -> GraphDirectoryService | _ADEmulatorDirectoryService:
        choice = settings.directory_provider
        if choice == "graph":
            return GraphDirectoryService(settings)
        if choice == "ad_emulator":
            return _ADEmulatorDirectoryService(settings)

        # auto mode
        if settings.entra_tenant_id and settings.entra_client_id and settings.entra_client_secret:
            return GraphDirectoryService(settings)
        if settings.ad_emulator_base_url:
            return _ADEmulatorDirectoryService(settings)

        raise DirectoryProviderUnavailableError(
            "No directory provider configured. Set ENTRA_CLIENT_SECRET for Graph or AD_EMULATOR_BASE_URL for fallback."
        )
