"""Discovery of authz-sensitive backend, schema, and frontend surfaces."""

from __future__ import annotations

import re
from collections.abc import Mapping
from pathlib import Path

from .contract_manifest import (
    FRONTEND_SOURCE_SUFFIXES,
    path_is_covered_by_contract_paths,
    path_is_covered_by_sensitive_paths,
)
from .models import DiscoveredAuthzPath, Finding

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ENDPOINT_AUTHZ_PATTERN = re.compile(
    r"\b("
    r"require_permission|require_business_permission|require_any_permission|"
    r"can_read_[A-Za-z0-9_]+|ensure_can_[A-Za-z0-9_]+|can_resolve_approvals|"
    r"_require_[A-Za-z0-9_]+"
    r")\b"
)
BACKEND_CAPABILITY_PATTERN = re.compile(r"\b(capabilities|[A-Za-z0-9_]+Capabilities)\b")
FRONTEND_GATE_DISCOVERY_PATTERN = re.compile(
    r"\b(PermissionGate|useAuthz|hasPermission|resolveCapabilityFlag|RouteGuard)\b"
)
DISCOVERY_ALLOWLIST: dict[str, str] = {
    "frontend/src/hooks/useUsersPageFilters.ts": (
        "Uses a same-named local helper to filter displayed permission strings; "
        "it is not an authorization decision point."
    ),
}


def read_source(path: Path, repo_root: Path = REPO_ROOT) -> str:
    try:
        return (repo_root / path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def discover_authz_paths(repo_root: Path = REPO_ROOT) -> list[DiscoveredAuthzPath]:
    discoveries: list[DiscoveredAuthzPath] = []

    for path in sorted(Path("backend/app/api/v1/endpoints").rglob("*.py")):
        match = BACKEND_ENDPOINT_AUTHZ_PATTERN.search(read_source(path, repo_root))
        if match:
            discoveries.append(DiscoveredAuthzPath(path, "backend_endpoint_guard", match.group(1)))

    for root in (Path("backend/app/services"), Path("backend/app/schemas")):
        for path in sorted(root.rglob("*.py")):
            match = BACKEND_CAPABILITY_PATTERN.search(read_source(path, repo_root))
            if match:
                discoveries.append(DiscoveredAuthzPath(path, "backend_capability_surface", match.group(1)))

    for path in sorted(Path("frontend/src").rglob("*")):
        if path.suffix not in FRONTEND_SOURCE_SUFFIXES:
            continue
        match = FRONTEND_GATE_DISCOVERY_PATTERN.search(read_source(path, repo_root))
        if match:
            discoveries.append(DiscoveredAuthzPath(path, "frontend_gate_surface", match.group(1)))

    return discoveries


def validate_discovered_authz_paths(
    contract_paths: set[Path],
    sensitive_paths: list[str],
    discoveries: list[DiscoveredAuthzPath] | None = None,
    allowlist: Mapping[str, str] | None = None,
    *,
    repo_root: Path = REPO_ROOT,
) -> list[Finding]:
    findings: list[Finding] = []
    allowlisted = dict(DISCOVERY_ALLOWLIST if allowlist is None else allowlist)
    discovered_paths = discoveries if discoveries is not None else discover_authz_paths(repo_root)

    for discovery in discovered_paths:
        path_posix = discovery.path.as_posix()
        if path_posix in allowlisted:
            continue
        covered_by_contract = path_is_covered_by_contract_paths(discovery.path, contract_paths)
        covered_by_sensitive_paths = path_is_covered_by_sensitive_paths(discovery.path, sensitive_paths)
        if not covered_by_contract:
            findings.append(
                Finding(
                    "discovered_authz_path_not_contractual",
                    f"{path_posix} uses {discovery.token} ({discovery.kind}) but is not covered "
                    "by JSON action path references. Add it to the matching contract action "
                    "or allowlist it with a reason.",
                )
            )
        if not covered_by_sensitive_paths:
            findings.append(
                Finding(
                    "discovered_authz_path_not_sensitive",
                    f"{path_posix} uses {discovery.token} ({discovery.kind}) but is not covered "
                    "by sensitive_change_paths. Add it to sensitive_change_paths or allowlist "
                    "it with a reason.",
                )
            )

    return findings


__all__ = [
    "BACKEND_ENDPOINT_AUTHZ_PATTERN",
    "DISCOVERY_ALLOWLIST",
    "DiscoveredAuthzPath",
    "Finding",
    "discover_authz_paths",
    "read_source",
    "validate_discovered_authz_paths",
]
