"""Trusted proxy-aware client IP resolution helpers."""

from __future__ import annotations

import ipaddress
import logging
from collections.abc import Iterable
from functools import lru_cache

from starlette.requests import Request

from app.core.proxy_policy import DEFAULT_TRUSTED_PROXIES
from app.core.proxy_policy import find_broad_trusted_proxy_entries as find_broad_trusted_proxy_entries
from app.core.proxy_policy import parse_trusted_networks as _parse_trusted_networks

logger = logging.getLogger("core.client_ip")


def _normalize_ip(value: str | None) -> str | None:
    """Return a canonical IP string when parseable, otherwise None."""
    if value is None:
        return None
    token = value.strip()
    if not token:
        return None
    try:
        return str(ipaddress.ip_address(token))
    except ValueError:
        return None



class ClientIPResolver:
    """Resolve effective client IP using a trusted-proxy chain model."""

    def __init__(self, trusted_proxies: Iterable[str] | None = None):
        entries = list(trusted_proxies) if trusted_proxies is not None else list(DEFAULT_TRUSTED_PROXIES)
        self.trusted_proxies = entries
        self._trusted_networks = _parse_trusted_networks(entries)

    def is_trusted_proxy(self, ip_str: str | None) -> bool:
        normalized = _normalize_ip(ip_str)
        if normalized is None:
            return False

        ip = ipaddress.ip_address(normalized)
        for network in self._trusted_networks:
            try:
                if ip in network:
                    return True
            except TypeError:
                continue
        return False

    def resolve(self, *, peer_ip: str | None, forwarded_for: str | None) -> str:
        """
        Resolve effective client IP.

        Algorithm:
        - Trust X-Forwarded-For only when immediate peer is trusted.
        - Build hop chain as XFF entries + peer_ip.
        - Remove trusted proxy hops from right to left.
        - Return the remaining right-most untrusted hop.
        - Fallback to peer_ip if chain is empty or malformed.
        """
        if not peer_ip:
            return "unknown"

        canonical_peer = _normalize_ip(peer_ip) or peer_ip
        if not self.is_trusted_proxy(canonical_peer):
            return canonical_peer

        hops: list[str] = []
        if forwarded_for:
            for token in forwarded_for.split(","):
                normalized = _normalize_ip(token)
                if normalized is None:
                    continue
                hops.append(normalized)

        chain = hops + [canonical_peer]
        for hop in reversed(chain):
            if self.is_trusted_proxy(hop):
                continue
            return hop
        return canonical_peer


@lru_cache(maxsize=32)
def _cached_resolver(trusted_proxies: tuple[str, ...]) -> ClientIPResolver:
    return ClientIPResolver(trusted_proxies)


def resolve_request_client_ip(request: Request, trusted_proxies: Iterable[str] | None = None) -> str:
    """Resolve request client IP using the trusted-proxy chain model."""
    proxy_entries = tuple(trusted_proxies) if trusted_proxies is not None else DEFAULT_TRUSTED_PROXIES
    resolver = _cached_resolver(proxy_entries)
    peer_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    return resolver.resolve(peer_ip=peer_ip, forwarded_for=forwarded)
