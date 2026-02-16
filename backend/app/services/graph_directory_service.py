from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import Settings
from app.schemas.directory import DirectoryUserRead

_GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
_GRAPH_SCOPE = "https://graph.microsoft.com/.default"


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

    async def search_users(self, *, query: str, limit: int = 25, skip: int = 0) -> list[DirectoryUserRead]:
        q = query.strip()
        if not q:
            return []
        safe_q = q.replace("'", "''")
        params = {
            "$select": "id,displayName,mail,userPrincipalName,department,jobTitle,accountEnabled",
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
            params={"$select": "id,displayName,mail,userPrincipalName,department,jobTitle,accountEnabled"},
            not_found_is_error=True,
        )
        return self._to_directory_user(payload)

    async def _graph_get(
        self,
        path: str,
        *,
        params: dict[str, str] | None = None,
        not_found_is_error: bool = False,
    ) -> dict[str, Any]:
        token = await self._get_access_token()
        headers = {"Authorization": f"Bearer {token}"}
        timeout = httpx.Timeout(self._settings.graph_timeout_seconds)
        url = f"{_GRAPH_BASE_URL}{path}"
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                response = await client.get(url, headers=headers, params=params)
            except httpx.HTTPError as exc:
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
        now = datetime.now(UTC)
        if self._token and self._token_expiry and now < self._token_expiry - timedelta(seconds=60):
            return self._token

        tenant_id = self._settings.entra_tenant_id
        client_id = self._settings.entra_client_id
        client_secret = self._settings.entra_client_secret
        if not tenant_id or not client_id or not client_secret:
            raise GraphProviderUnavailableError(
                "Graph credentials are not configured (ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET)"
            )

        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        timeout = httpx.Timeout(self._settings.graph_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                response = await client.post(
                    token_url,
                    data={
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "scope": _GRAPH_SCOPE,
                        "grant_type": "client_credentials",
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
            except httpx.HTTPError as exc:
                raise GraphProviderUnavailableError(f"Failed to acquire Graph token: {exc}") from exc

        if response.status_code >= 400:
            detail = response.text[:200]
            raise GraphProviderUnavailableError(
                f"Failed to acquire Graph token ({response.status_code}): {detail}"
            )

        payload: dict[str, Any] = response.json()
        access_token = payload.get("access_token")
        expires_in = payload.get("expires_in")
        if not isinstance(access_token, str) or not access_token:
            raise GraphProviderUnavailableError("Graph token response missing access_token")

        lifetime = int(expires_in) if isinstance(expires_in, int | float | str) and str(expires_in).isdigit() else 3600
        self._token = access_token
        self._token_expiry = now + timedelta(seconds=max(lifetime, 60))
        return self._token

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
        account_enabled = payload.get("accountEnabled")

        return DirectoryUserRead(
            external_id=oid,
            display_name=display_name,
            email=mail_raw.strip().lower() if isinstance(mail_raw, str) and mail_raw.strip() else None,
            user_principal_name=upn_raw.strip().lower() if isinstance(upn_raw, str) and upn_raw.strip() else None,
            department=department_raw.strip() if isinstance(department_raw, str) and department_raw.strip() else None,
            job_title=job_title_raw.strip() if isinstance(job_title_raw, str) and job_title_raw.strip() else None,
            account_enabled=bool(account_enabled) if isinstance(account_enabled, bool) else True,
            source="graph",
        )
