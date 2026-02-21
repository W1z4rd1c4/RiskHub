from __future__ import annotations

import ipaddress
from typing import Iterable
from urllib.parse import urlparse

import httpx

from app.core.config import Settings


class OutboundRequestError(RuntimeError):
    """Raised when an outbound request violates security guardrails."""


def _normalize_host(host: str | None) -> str | None:
    if not host:
        return None
    normalized = host.strip().lower().rstrip(".")
    return normalized or None


def _host_matches_allowlist(host: str, allowlist: set[str]) -> bool:
    if host in allowlist:
        return True
    return any(host.endswith(f".{entry}") for entry in allowlist)


def _is_private_or_local_host(host: str) -> bool:
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def extract_host(url: str) -> str | None:
    return _normalize_host(urlparse(url).hostname)


def guard_outbound_url(
    *,
    url: str,
    settings: Settings,
    allowed_hosts: Iterable[str] | None = None,
    allow_private: bool = False,
) -> None:
    parsed = urlparse(url)
    scheme = (parsed.scheme or "").lower()
    if scheme not in {"http", "https"}:
        raise OutboundRequestError("Outbound URL must use http/https.")

    host = _normalize_host(parsed.hostname)
    if not host:
        raise OutboundRequestError("Outbound URL host is missing.")

    merged_allowlist = {
        normalized
        for candidate in (list(settings.outbound_allowed_hosts) + list(allowed_hosts or []))
        if (normalized := _normalize_host(candidate))
    }
    if merged_allowlist and not _host_matches_allowlist(host, merged_allowlist):
        raise OutboundRequestError(f"Outbound host is not allowlisted: {host}")

    allow_private_effective = bool(allow_private or settings.outbound_allow_private_destinations)
    if not allow_private_effective and _is_private_or_local_host(host):
        raise OutboundRequestError(f"Private/local outbound destination is blocked: {host}")


def build_outbound_client(*, settings: Settings, timeout_seconds: float) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(timeout_seconds),
        trust_env=False,
        follow_redirects=not settings.outbound_block_redirects,
    )
