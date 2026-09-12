"""Dependency-free proxy trust policy shared by runtime and installer validation."""

from __future__ import annotations

import ipaddress
import logging
from collections.abc import Iterable

logger = logging.getLogger("core.client_ip")

DEFAULT_TRUSTED_PROXIES: tuple[str, ...] = (
    "127.0.0.1",
    "::1",
)

_BROAD_TRUSTED_PROXY_WARNINGS: tuple[str, ...] = (
    "0.0.0.0/0",
    "::/0",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "fd00::/8",
)


def parse_trusted_networks(
    trusted_proxies: Iterable[str],
) -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
    for entry in trusted_proxies:
        token = entry.strip()
        if not token:
            continue
        try:
            if "/" in token:
                network = ipaddress.ip_network(token, strict=False)
            else:
                address = ipaddress.ip_address(token)
                prefix = 32 if address.version == 4 else 128
                network = ipaddress.ip_network(f"{address}/{prefix}", strict=False)
            networks.append(network)
        except ValueError as exc:
            logger.warning("invalid_trusted_proxy_config entry=%s error=%s", entry, exc)
    return networks


def find_broad_trusted_proxy_entries(trusted_proxies: Iterable[str]) -> list[str]:
    broad_networks = parse_trusted_networks(_BROAD_TRUSTED_PROXY_WARNINGS)
    flagged: list[str] = []
    for entry in trusted_proxies:
        networks = parse_trusted_networks([entry])
        if not networks:
            continue
        network = networks[0]
        if any(network == broad for broad in broad_networks):
            flagged.append(entry.strip())
    return flagged
