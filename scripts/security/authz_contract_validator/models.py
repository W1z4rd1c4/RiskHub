"""Shared data models for the authorization contract validator."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Finding:
    reason: str
    detail: str


@dataclass(frozen=True)
class ContractPathReference:
    action_id: str
    field: str
    path: Path
    exists: bool


@dataclass(frozen=True)
class DiscoveredAuthzPath:
    path: Path
    kind: str
    token: str

