from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.core.email import normalize_email
from app.schemas.directory import DirectoryUserRead
from app.services.directory_identity_service import normalize_business_role
from app.services.graph_directory_auth import GraphAccessTokenProvider, reset_graph_token_cache_for_tests
from app.services.graph_directory_errors import (
    GraphDirectoryProviderError,
    GraphProviderUnavailableError,
    GraphUserNotFoundError,
)
from app.services.graph_directory_transport import GraphApiTransport


class GraphDirectoryService:
    """Microsoft Graph directory client using client-credentials flow."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._token_provider = GraphAccessTokenProvider(settings)
        self._transport = GraphApiTransport(settings, self._token_provider)

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
        return await self._transport.get(path, params=params, not_found_is_error=not_found_is_error)

    async def _get_access_token(self) -> str:
        return await self._token_provider.get_access_token()

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
    reset_graph_token_cache_for_tests()
