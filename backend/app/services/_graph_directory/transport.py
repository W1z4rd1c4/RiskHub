from __future__ import annotations

from typing import Any

import httpx

from app.core.config import Settings
from app.core.outbound_guard import (
    OutboundRequestError,
    build_outbound_client,
    guard_outbound_url,
    guarded_get,
)
from app.services._graph_directory.auth import GraphAccessTokenProvider
from app.services._graph_directory.errors import (
    GraphDirectoryProviderError,
    GraphProviderUnavailableError,
    GraphUserNotFoundError,
)

_GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"


class GraphApiTransport:
    """Minimal transport layer for Graph GET requests."""

    def __init__(self, settings: Settings, token_provider: GraphAccessTokenProvider):
        self._settings = settings
        self._token_provider = token_provider

    async def get(
        self,
        path: str,
        *,
        params: dict[str, str] | None = None,
        not_found_is_error: bool = False,
    ) -> dict[str, Any]:
        token = await self._token_provider.get_access_token()
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

        payload = response.json()
        if not isinstance(payload, dict):
            raise GraphDirectoryProviderError("Graph response payload is invalid")
        return payload
