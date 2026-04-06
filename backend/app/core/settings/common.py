from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


def normalize_optional_string(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


@dataclass(frozen=True)
class EntraConfidentialCredential:
    mode: Literal["secret", "certificate"]
    client_secret: str | None = None
    client_certificate_private_key: str | None = None
    client_certificate_thumbprint: str | None = None
