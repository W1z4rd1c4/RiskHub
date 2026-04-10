from __future__ import annotations

import asyncio
import ipaddress
import socket
from typing import Iterable
from urllib.parse import urljoin, urlparse

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
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified
    )


def _is_disallowed_ip(ip: ipaddress._BaseAddress) -> bool:
    return bool(
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified
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
    outbound_settings = settings.outbound
    parsed = urlparse(url)
    scheme = (parsed.scheme or "").lower()
    if scheme not in {"http", "https"}:
        raise OutboundRequestError("Outbound URL must use http/https.")

    host = _normalize_host(parsed.hostname)
    if not host:
        raise OutboundRequestError("Outbound URL host is missing.")

    merged_allowlist = {
        normalized
        for candidate in (list(outbound_settings.allowed_hosts) + list(allowed_hosts or []))
        if (normalized := _normalize_host(candidate))
    }
    if merged_allowlist and not _host_matches_allowlist(host, merged_allowlist):
        raise OutboundRequestError(f"Outbound host is not allowlisted: {host}")

    allow_private_effective = bool(allow_private or outbound_settings.allow_private_destinations)
    if not allow_private_effective and _is_private_or_local_host(host):
        raise OutboundRequestError(f"Private/local outbound destination is blocked: {host}")


async def resolve_outbound_ips(host: str) -> set[ipaddress._BaseAddress]:
    try:
        addr_info = await asyncio.get_running_loop().getaddrinfo(
            host,
            None,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
        )
    except socket.gaierror as exc:
        raise OutboundRequestError(f"Failed to resolve outbound host: {host}") from exc

    resolved_ips: set[ipaddress._BaseAddress] = set()
    for _family, _socktype, _proto, _canonname, sockaddr in addr_info:
        resolved_ips.add(ipaddress.ip_address(str(sockaddr[0])))
    if not resolved_ips:
        raise OutboundRequestError(f"Failed to resolve outbound host: {host}")
    return resolved_ips


async def guard_resolved_outbound_url(
    *,
    url: str,
    settings: Settings,
    allowed_hosts: Iterable[str] | None = None,
    allow_private: bool = False,
) -> None:
    outbound_settings = settings.outbound
    guard_outbound_url(
        url=url,
        settings=settings,
        allowed_hosts=allowed_hosts,
        allow_private=allow_private,
    )
    host = extract_host(url)
    if host is None:
        raise OutboundRequestError("Outbound URL host is missing.")

    allow_private_effective = bool(allow_private or outbound_settings.allow_private_destinations)
    if allow_private_effective:
        return

    for resolved_ip in await resolve_outbound_ips(host):
        if _is_disallowed_ip(resolved_ip):
            raise OutboundRequestError(f"Outbound destination resolves to blocked IP: {resolved_ip}")


async def guarded_get(
    client: httpx.AsyncClient,
    *,
    url: str,
    settings: Settings,
    allowed_hosts: Iterable[str] | None = None,
    allow_private: bool = False,
    params: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
    max_redirects: int = 5,
) -> httpx.Response:
    outbound_settings = settings.outbound
    current_url = url
    current_params = params
    for redirect_count in range(max_redirects + 1):
        await guard_resolved_outbound_url(
            url=current_url,
            settings=settings,
            allowed_hosts=allowed_hosts,
            allow_private=allow_private,
        )
        response = await client.get(
            current_url,
            params=current_params,
            headers=headers,
            follow_redirects=False,
        )
        if response.status_code not in (301, 302, 303, 307, 308):
            return response
        if outbound_settings.block_redirects:
            return response
        location = response.headers.get("location")
        if not location:
            return response
        current_url = urljoin(current_url, location)
        current_params = None
        if redirect_count == max_redirects:
            raise OutboundRequestError("Outbound redirect chain exceeded the maximum allowed hops.")
    raise OutboundRequestError("Outbound redirect chain could not be resolved.")


def build_outbound_client(*, settings: Settings, timeout_seconds: float) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(timeout_seconds),
        trust_env=False,
        follow_redirects=False,
    )
