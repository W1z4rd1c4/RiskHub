"""JSON contract manifest validation for authorization/capability coverage."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Mapping

from .models import ContractPathReference, Finding

REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACT_MD = Path("docs/security/authorization-capability-contract.md")
CONTRACT_JSON = Path("docs/security/authorization-capability-contract.json")

REQUIRED_ACTION_FIELDS = (
    "id",
    "surface",
    "action",
    "actor_scope",
    "backend_authority",
    "service_policy",
    "response_capability",
    "frontend_gate",
    "tests",
    "status",
    "findings",
)

VALID_STATUSES = {"authoritative", "local_fallback", "needs_review"}
ID_PATTERN = re.compile(r"\bAUTHZ-[A-Z0-9-]+\b")
PATH_REFERENCE_RE = re.compile(r"\b(?:backend|frontend)/[A-Za-z0-9_./-]+")
FRONTEND_AUTHZ_TOKEN_PATTERN = re.compile(
    r"(capabilit|PermissionGate|useAuthz|hasPermission|can[A-Z]|RouteGuard|resource=|action=)",
    re.IGNORECASE,
)
FRONTEND_SOURCE_SUFFIXES = {".ts", ".tsx"}


def repo_path(path: Path, repo_root: Path = REPO_ROOT) -> Path:
    return repo_root / path


def path_exists(rel_path: str, repo_root: Path = REPO_ROOT) -> bool:
    return repo_path(Path(rel_path), repo_root).exists()


def path_is_covered_by_sensitive_paths(path: Path, sensitive_paths: list[str]) -> bool:
    path_posix = path.as_posix()
    for raw_prefix in sensitive_paths:
        prefix = raw_prefix.rstrip("/")
        if path_posix == prefix or path_posix.startswith(f"{prefix}/"):
            return True
    return False


def path_is_covered_by_contract_paths(path: Path, contract_paths: set[Path]) -> bool:
    path_posix = path.as_posix()
    for contract_path in contract_paths:
        prefix = contract_path.as_posix().rstrip("/")
        if path_posix == prefix or path_posix.startswith(f"{prefix}/"):
            return True
    return False


def extract_contract_path_references(
    action: dict[str, Any],
    repo_root: Path = REPO_ROOT,
) -> list[ContractPathReference]:
    action_id = str(action.get("id", "<unknown>"))
    references: list[ContractPathReference] = []
    for field in ("backend_authority", "service_policy", "response_capability", "frontend_gate"):
        value = action.get(field)
        if not isinstance(value, str):
            continue
        for match in PATH_REFERENCE_RE.finditer(value):
            candidate = Path(match.group(0).rstrip(".,;:)"))
            references.append(
                ContractPathReference(
                    action_id=action_id,
                    field=field,
                    path=candidate,
                    exists=repo_path(candidate, repo_root).exists(),
                )
            )
    return references


def extract_contract_paths(actions: list[dict[str, Any]], repo_root: Path = REPO_ROOT) -> set[Path]:
    paths: set[Path] = set()
    for action in actions:
        for reference in extract_contract_path_references(action, repo_root):
            if reference.exists:
                paths.add(reference.path)
    return paths


def diff_has_frontend_authz_tokens(diff_text: str) -> bool:
    for line in diff_text.splitlines():
        if line.startswith(("+++", "---")):
            continue
        if line.startswith(("+", "-")) and FRONTEND_AUTHZ_TOKEN_PATTERN.search(line[1:]):
            return True
    return False


def is_exact_manifest_path(path_posix: str, raw_prefix: str) -> bool:
    return not raw_prefix.endswith("/") and path_posix == raw_prefix


def path_is_sensitive(
    path: Path,
    prefixes: list[str],
    diff_by_path: Mapping[Path, str] | None = None,
) -> bool:
    path_posix = path.as_posix()
    for raw_prefix in prefixes:
        prefix = raw_prefix.rstrip("/")
        if path_posix == prefix or path_posix.startswith(f"{prefix}/"):
            if path_posix.startswith("frontend/src/"):
                if is_exact_manifest_path(path_posix, raw_prefix):
                    return True
                if path.suffix not in FRONTEND_SOURCE_SUFFIXES:
                    return False
                if diff_by_path is None:
                    return True
                return diff_has_frontend_authz_tokens(diff_by_path.get(path, ""))
            return True
    return False


def format_manifest_findings(findings: Any) -> str:
    if not isinstance(findings, list) or not findings:
        return "None"
    return "; ".join(str(finding) for finding in findings)


def validate_manifest(
    manifest: Any,
    *,
    repo_root: Path = REPO_ROOT,
    run_discovery: bool = True,
) -> tuple[set[str], list[str], list[Finding]]:
    findings: list[Finding] = []
    if not isinstance(manifest, dict):
        return set(), [], [Finding("manifest_shape", "root must be a JSON object")]

    actions = manifest.get("actions")
    if not isinstance(actions, list) or not actions:
        findings.append(Finding("manifest_actions", "actions must be a non-empty list"))
        return set(), [], findings

    sensitive_paths = manifest.get("sensitive_change_paths")
    if not isinstance(sensitive_paths, list) or not all(isinstance(item, str) for item in sensitive_paths):
        findings.append(Finding("manifest_sensitive_paths", "sensitive_change_paths must be a list of strings"))
        sensitive_paths = []

    ids: set[str] = set()
    for index, action in enumerate(actions, start=1):
        if not isinstance(action, dict):
            findings.append(Finding("action_shape", f"action #{index} must be an object"))
            continue

        action_id = action.get("id", f"#{index}")
        for field in REQUIRED_ACTION_FIELDS:
            if field not in action:
                findings.append(Finding("missing_action_field", f"{action_id}: {field}"))

        if not isinstance(action.get("id"), str) or not ID_PATTERN.fullmatch(action["id"]):
            findings.append(Finding("invalid_action_id", str(action_id)))
        elif action["id"] in ids:
            findings.append(Finding("duplicate_action_id", action["id"]))
        else:
            ids.add(action["id"])

        if action.get("status") not in VALID_STATUSES:
            findings.append(Finding("invalid_status", f"{action_id}: {action.get('status')}"))

        tests = action.get("tests")
        if not isinstance(tests, list) or not tests:
            findings.append(Finding("missing_tests", str(action_id)))
        elif not all(isinstance(item, str) and item for item in tests):
            findings.append(Finding("invalid_tests", str(action_id)))
        else:
            for test_path in tests:
                if not path_exists(test_path, repo_root):
                    findings.append(Finding("missing_test_path", f"{action_id}: {test_path}"))

    for rel_path in sensitive_paths:
        if not path_exists(rel_path, repo_root):
            findings.append(Finding("missing_sensitive_path", rel_path))

    contract_paths: set[Path] = set()
    for action in actions:
        if not isinstance(action, dict):
            continue
        for reference in extract_contract_path_references(action, repo_root):
            if not reference.exists:
                findings.append(
                    Finding(
                        "contract_path_missing",
                        f"{reference.action_id}.{reference.field}: {reference.path.as_posix()}",
                    )
                )
                continue
            contract_paths.add(reference.path)
            if not path_is_covered_by_sensitive_paths(reference.path, list(sensitive_paths)):
                findings.append(
                    Finding(
                        "authority_path_not_sensitive",
                        f"{reference.action_id}: {reference.path.as_posix()}",
                    )
                )

    if run_discovery:
        from .discovery import validate_discovered_authz_paths

        findings.extend(validate_discovered_authz_paths(contract_paths, list(sensitive_paths), repo_root=repo_root))

    return ids, list(sensitive_paths), findings


def validate_doc_touch(
    changed_files: list[Path],
    sensitive_paths: list[str],
    diff_by_path: Mapping[Path, str] | None = None,
    *,
    contract_md: Path = CONTRACT_MD,
    contract_json: Path = CONTRACT_JSON,
) -> list[Finding]:
    if not changed_files:
        return []

    contract_paths = {contract_md, contract_json}
    touched_contract_paths = contract_paths.intersection(changed_files)
    sensitive_changed = [
        path.as_posix()
        for path in changed_files
        if path not in contract_paths and path_is_sensitive(path, sensitive_paths, diff_by_path)
    ]

    if sensitive_changed and touched_contract_paths != contract_paths:
        missing_contract_paths = sorted(path.as_posix() for path in contract_paths - touched_contract_paths)
        return [
            Finding(
                "authz_contract_not_updated",
                "Authz-sensitive files changed without updating "
                f"both {contract_md} and {contract_json}. Missing: "
                f"{', '.join(missing_contract_paths)}. Sensitive changes: "
                f"{', '.join(sensitive_changed)}",
            )
        ]
    return []


__all__ = [
    "CONTRACT_JSON",
    "CONTRACT_MD",
    "ContractPathReference",
    "Finding",
    "diff_has_frontend_authz_tokens",
    "extract_contract_path_references",
    "extract_contract_paths",
    "format_manifest_findings",
    "is_exact_manifest_path",
    "path_exists",
    "path_is_covered_by_contract_paths",
    "path_is_covered_by_sensitive_paths",
    "path_is_sensitive",
    "repo_path",
    "validate_doc_touch",
    "validate_manifest",
]
