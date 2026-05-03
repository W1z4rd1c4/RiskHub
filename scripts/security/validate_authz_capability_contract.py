#!/usr/bin/env python3
"""Validate the authorization/capability contract docs and change gate."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Mapping

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from authz_contract_manifest import (  # noqa: E402
    BUSINESS_ROUTE_NAV_EXPECTATIONS,
    FRONTEND_LOCAL_GATE_CLASSIFICATIONS,
    FrontendLocalGateClassification,
)
from authz_contract_validator import cli as authz_cli  # noqa: E402
from authz_contract_validator import capability_catalog as capability_catalog_validator  # noqa: E402
from authz_contract_validator import frontend_routes as frontend_route_validator  # noqa: E402
from authz_contract_validator import git_inputs as git_input_collector  # noqa: E402
from authz_contract_validator import runner as authz_runner  # noqa: E402
from authz_contract_validator.models import (  # noqa: E402
    ContractPathReference as AuthzContractPathReference,
    DiscoveredAuthzPath as AuthzDiscoveredAuthzPath,
    Finding as AuthzFinding,
)

CONTRACT_MD = Path("docs/security/authorization-capability-contract.md")
CONTRACT_JSON = Path("docs/security/authorization-capability-contract.json")
CAPABILITY_CATALOG_JSON = Path("docs/security/capability-catalog.json")

REQUIRED_MD_SECTIONS = (
    "## Purpose",
    "## Architecture Principles",
    "## Vocabulary",
    "## Maintenance Rule",
    "## Contract Matrix",
    "## Capability Gap Register",
    "## Evidence Map",
    "## Required Verification",
    "## Out Of Scope",
)

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
DIFF_HEADER_RE = re.compile(r"^diff --git a/(.+) b/(.+)$")
PATH_REFERENCE_RE = re.compile(r"\b(?:backend|frontend)/[A-Za-z0-9_./-]+")
FRONTEND_AUTHZ_TOKEN_PATTERN = re.compile(
    r"(capabilit|PermissionGate|useAuthz|hasPermission|can[A-Z]|RouteGuard|resource=|action=)",
    re.IGNORECASE,
)
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
FRONTEND_LOCAL_GATE_PATTERN = re.compile(r"\b(PermissionGate|usePermissions|hasPermission)\b")
BACKEND_BOOL_FIELD_PATTERN = re.compile(
    r"^\s+([A-Za-z_][A-Za-z0-9_]*):\s*bool(?:\s*=.*)?(?:\s*#.*)?$"
)
FRONTEND_BOOL_FIELD_PATTERN = re.compile(
    r"^\s*([A-Za-z_][A-Za-z0-9_]*):\s*z\.boolean\(\)"
)
FRONTEND_SOURCE_SUFFIXES = {".ts", ".tsx"}
DISCOVERY_ALLOWLIST: dict[str, str] = {
    "frontend/src/hooks/useUsersPageFilters.ts": (
        "Uses a same-named local helper to filter displayed permission strings; "
        "it is not an authorization decision point."
    ),
}
MATRIX_FIELD_MAP = {
    "ID": "id",
    "Surface": "surface",
    "Action": "action",
    "Actor scope": "actor_scope",
    "Backend authority": "backend_authority",
    "Service policy": "service_policy",
    "Response capability": "response_capability",
    "Frontend gate": "frontend_gate",
    "Status": "status",
    "Findings": "findings",
    "Tests": "tests",
}


Finding = AuthzFinding
ContractPathReference = AuthzContractPathReference
DiscoveredAuthzPath = AuthzDiscoveredAuthzPath


def _repo_path(path: Path) -> Path:
    return REPO_ROOT / path


def _run_git(*args: str) -> subprocess.CompletedProcess[str]:
    return git_input_collector.run_git(REPO_ROOT, *args)


def _load_json(path: Path) -> Any:
    try:
        return json.loads(_repo_path(path).read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: invalid JSON: {exc}") from exc


def _changed_files(base_ref: str) -> list[Path]:
    return git_input_collector.changed_files(REPO_ROOT, base_ref)


def _changed_file_diffs(base_ref: str) -> dict[Path, str]:
    return git_input_collector.changed_file_diffs(REPO_ROOT, base_ref)


def _path_exists(rel_path: str) -> bool:
    path = _repo_path(Path(rel_path))
    return path.exists()


def _path_is_covered_by_sensitive_paths(path: Path, sensitive_paths: list[str]) -> bool:
    path_posix = path.as_posix()
    for raw_prefix in sensitive_paths:
        prefix = raw_prefix.rstrip("/")
        if path_posix == prefix or path_posix.startswith(f"{prefix}/"):
            return True
    return False


def _path_is_covered_by_contract_paths(path: Path, contract_paths: set[Path]) -> bool:
    path_posix = path.as_posix()
    for contract_path in contract_paths:
        prefix = contract_path.as_posix().rstrip("/")
        if path_posix == prefix or path_posix.startswith(f"{prefix}/"):
            return True
    return False


def _extract_contract_path_references(action: dict[str, Any]) -> list[ContractPathReference]:
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
                    exists=_repo_path(candidate).exists(),
                )
            )
    return references


def _extract_contract_paths(actions: list[dict[str, Any]]) -> set[Path]:
    paths: set[Path] = set()
    for action in actions:
        for reference in _extract_contract_path_references(action):
            if reference.exists:
                paths.add(reference.path)
    return paths


def _diff_has_frontend_authz_tokens(diff_text: str) -> bool:
    for line in diff_text.splitlines():
        if line.startswith(("+++", "---")):
            continue
        if line.startswith(("+", "-")) and FRONTEND_AUTHZ_TOKEN_PATTERN.search(line[1:]):
            return True
    return False


def _diff_has_frontend_local_gate_tokens(diff_text: str) -> bool:
    return bool(_frontend_local_gate_lines_from_diff(diff_text))


def _frontend_local_gate_lines_from_diff(diff_text: str) -> list[str]:
    lines: list[str] = []
    for line in diff_text.splitlines():
        if line.startswith(("+++", "---")):
            continue
        if line.startswith("+") and FRONTEND_LOCAL_GATE_PATTERN.search(line[1:]):
            lines.append(line[1:].strip())
    return lines


def _frontend_local_gate_lines_from_source(path: Path) -> list[str]:
    return [
        line.strip()
        for line in _read_source(path).splitlines()
        if FRONTEND_LOCAL_GATE_PATTERN.search(line)
    ]


def _line_matches_any_pattern(line: str, patterns: tuple[str, ...]) -> bool:
    return any(re.fullmatch(pattern, line) for pattern in patterns)


_normalize_typescript_expression = frontend_route_validator.normalize_typescript_expression
_describe_business_nav_authority = frontend_route_validator.describe_business_nav_authority
_extract_route_objects_from_array = frontend_route_validator.extract_route_objects_from_array
_extract_single_quoted_field = frontend_route_validator.extract_single_quoted_field
_extract_is_visible_expression = frontend_route_validator.extract_is_visible_expression
_validate_business_route_nav_context = frontend_route_validator.validate_business_route_nav_context


_read_catalog_source = capability_catalog_validator._read_catalog_source
_extract_python_class_body = capability_catalog_validator._extract_python_class_body
_extract_backend_capability_fields = capability_catalog_validator._extract_backend_capability_fields
_find_matching_closing_brace = capability_catalog_validator._find_matching_closing_brace
_extract_typescript_schema_body = capability_catalog_validator._extract_typescript_schema_body
_extract_frontend_capability_fields = capability_catalog_validator._extract_frontend_capability_fields
_validate_capability_catalog = capability_catalog_validator.validate_capability_catalog


def _is_exact_manifest_path(path_posix: str, raw_prefix: str) -> bool:
    return not raw_prefix.endswith("/") and path_posix == raw_prefix


def _path_is_sensitive(
    path: Path,
    prefixes: list[str],
    diff_by_path: Mapping[Path, str] | None = None,
) -> bool:
    path_posix = path.as_posix()
    for raw_prefix in prefixes:
        prefix = raw_prefix.rstrip("/")
        if path_posix == prefix or path_posix.startswith(f"{prefix}/"):
            if path_posix.startswith("frontend/src/"):
                if _is_exact_manifest_path(path_posix, raw_prefix):
                    return True
                if path.suffix not in FRONTEND_SOURCE_SUFFIXES:
                    return False
                if diff_by_path is None:
                    return True
                return _diff_has_frontend_authz_tokens(diff_by_path.get(path, ""))
            return True
    return False


def _normalize_markdown_cell(value: str) -> str:
    value = value.replace("`", "").replace("&nbsp;", " ")
    value = re.sub(r"<br\s*/?>", " ", value, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", value).strip()


def _split_markdown_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _extract_contract_matrix_rows(md_text: str) -> tuple[list[str], list[dict[str, str]], list[Finding]]:
    findings: list[Finding] = []
    section_marker = "## Contract Matrix"
    try:
        section_start = md_text.index(section_marker)
    except ValueError:
        return [], [], [Finding("missing_markdown_section", section_marker)]

    next_section = md_text.find("\n## ", section_start + len(section_marker))
    section_text = md_text[section_start: next_section if next_section != -1 else len(md_text)]
    table_lines = [line for line in section_text.splitlines() if line.startswith("|")]
    if len(table_lines) < 2:
        return [], [], [Finding("missing_contract_matrix", "Contract Matrix table not found")]

    headers = _split_markdown_row(table_lines[0])
    expected_headers = list(MATRIX_FIELD_MAP)
    if headers != expected_headers:
        findings.append(
            Finding(
                "contract_matrix_headers",
                f"expected {expected_headers}; found {headers}",
            )
        )
        return headers, [], findings

    rows: list[dict[str, str]] = []
    for line in table_lines[2:]:
        cells = _split_markdown_row(line)
        if len(cells) != len(headers):
            findings.append(Finding("contract_matrix_row_shape", line))
            continue
        rows.append(dict(zip(headers, cells, strict=True)))
    return headers, rows, findings


def _parse_markdown_test_paths(value: str) -> set[str]:
    normalized = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    normalized = normalized.replace("`", "")
    return {
        line.strip()
        for line in normalized.splitlines()
        if line.strip()
    }


def _format_manifest_findings(findings: Any) -> str:
    if not isinstance(findings, list) or not findings:
        return "None"
    return "; ".join(str(finding) for finding in findings)


def _validate_markdown(md_text: str, actions: list[dict[str, Any]]) -> list[Finding]:
    findings: list[Finding] = []
    for section in REQUIRED_MD_SECTIONS:
        if section not in md_text:
            findings.append(Finding("missing_markdown_section", section))

    _, matrix_rows, matrix_findings = _extract_contract_matrix_rows(md_text)
    findings.extend(matrix_findings)
    matrix_by_id: dict[str, dict[str, str]] = {}
    for row in matrix_rows:
        action_id = row.get("ID", "")
        if action_id in matrix_by_id:
            findings.append(Finding("duplicate_markdown_action_id", action_id))
        matrix_by_id[action_id] = row

    manifest_by_id = {
        action["id"]: action
        for action in actions
        if isinstance(action, dict) and isinstance(action.get("id"), str)
    }
    manifest_ids = set(manifest_by_id)
    markdown_ids = set(matrix_by_id)
    missing_in_md = sorted(manifest_ids - markdown_ids)
    extra_in_md = sorted(markdown_ids - manifest_ids)
    if missing_in_md:
        findings.append(
            Finding("manifest_ids_missing_from_markdown", ", ".join(missing_in_md))
        )
    if extra_in_md:
        findings.append(
            Finding("markdown_ids_missing_from_manifest", ", ".join(extra_in_md))
        )

    for action_id in sorted(manifest_ids & markdown_ids):
        markdown_row = matrix_by_id[action_id]
        action = manifest_by_id[action_id]
        for header, field in MATRIX_FIELD_MAP.items():
            markdown_value = markdown_row.get(header, "")
            if field == "tests":
                markdown_tests = _parse_markdown_test_paths(markdown_value)
                manifest_tests = set(action.get("tests", []))
                if markdown_tests != manifest_tests:
                    findings.append(
                        Finding(
                            "contract_matrix_tests_mismatch",
                            f"{action_id}: markdown={sorted(markdown_tests)} manifest={sorted(manifest_tests)}",
                        )
                    )
                continue

            if field == "findings":
                manifest_value = _format_manifest_findings(action.get(field))
            else:
                manifest_value = str(action.get(field, ""))
            if _normalize_markdown_cell(markdown_value) != _normalize_markdown_cell(manifest_value):
                findings.append(
                    Finding(
                        "contract_matrix_field_mismatch",
                        f"{action_id}.{field}: markdown={markdown_value!r} manifest={manifest_value!r}",
                    )
                )
    return findings


def _validate_manifest(manifest: Any, *, run_discovery: bool = True) -> tuple[set[str], list[str], list[Finding]]:
    findings: list[Finding] = []
    if not isinstance(manifest, dict):
        return set(), [], [Finding("manifest_shape", "root must be a JSON object")]

    actions = manifest.get("actions")
    if not isinstance(actions, list) or not actions:
        findings.append(Finding("manifest_actions", "actions must be a non-empty list"))
        return set(), [], findings

    sensitive_paths = manifest.get("sensitive_change_paths")
    if not isinstance(sensitive_paths, list) or not all(isinstance(item, str) for item in sensitive_paths):
        findings.append(
            Finding("manifest_sensitive_paths", "sensitive_change_paths must be a list of strings")
        )
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
                if not _path_exists(test_path):
                    findings.append(Finding("missing_test_path", f"{action_id}: {test_path}"))

    for rel_path in sensitive_paths:
        if not _path_exists(rel_path):
            findings.append(Finding("missing_sensitive_path", rel_path))

    contract_paths: set[Path] = set()
    for action in actions:
        if not isinstance(action, dict):
            continue
        for reference in _extract_contract_path_references(action):
            if not reference.exists:
                findings.append(
                    Finding(
                        "contract_path_missing",
                        f"{reference.action_id}.{reference.field}: {reference.path.as_posix()}",
                    )
                )
                continue
            contract_paths.add(reference.path)
            if not _path_is_covered_by_sensitive_paths(reference.path, list(sensitive_paths)):
                findings.append(
                    Finding(
                        "authority_path_not_sensitive",
                        f"{reference.action_id}: {reference.path.as_posix()}",
                    )
                )

    if run_discovery:
        findings.extend(_validate_discovered_authz_paths(contract_paths, list(sensitive_paths)))

    return ids, list(sensitive_paths), findings


def _read_source(path: Path) -> str:
    try:
        return _repo_path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _discover_authz_paths() -> list[DiscoveredAuthzPath]:
    discoveries: list[DiscoveredAuthzPath] = []

    for path in sorted(Path("backend/app/api/v1/endpoints").rglob("*.py")):
        match = BACKEND_ENDPOINT_AUTHZ_PATTERN.search(_read_source(path))
        if match:
            discoveries.append(DiscoveredAuthzPath(path, "backend_endpoint_guard", match.group(1)))

    for root in (Path("backend/app/services"), Path("backend/app/schemas")):
        for path in sorted(root.rglob("*.py")):
            match = BACKEND_CAPABILITY_PATTERN.search(_read_source(path))
            if match:
                discoveries.append(DiscoveredAuthzPath(path, "backend_capability_surface", match.group(1)))

    for path in sorted(Path("frontend/src").rglob("*")):
        if path.suffix not in FRONTEND_SOURCE_SUFFIXES:
            continue
        match = FRONTEND_GATE_DISCOVERY_PATTERN.search(_read_source(path))
        if match:
            discoveries.append(DiscoveredAuthzPath(path, "frontend_gate_surface", match.group(1)))

    return discoveries


def _validate_discovered_authz_paths(
    contract_paths: set[Path],
    sensitive_paths: list[str],
    discoveries: list[DiscoveredAuthzPath] | None = None,
    allowlist: Mapping[str, str] | None = None,
) -> list[Finding]:
    findings: list[Finding] = []
    allowlisted = dict(DISCOVERY_ALLOWLIST if allowlist is None else allowlist)
    discovered_paths = discoveries if discoveries is not None else _discover_authz_paths()

    for discovery in discovered_paths:
        path_posix = discovery.path.as_posix()
        if path_posix in allowlisted:
            continue
        covered_by_contract = _path_is_covered_by_contract_paths(discovery.path, contract_paths)
        covered_by_sensitive_paths = _path_is_covered_by_sensitive_paths(discovery.path, sensitive_paths)
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


def _validate_doc_touch(
    changed_files: list[Path],
    sensitive_paths: list[str],
    diff_by_path: Mapping[Path, str] | None = None,
) -> list[Finding]:
    if not changed_files:
        return []

    contract_paths = {CONTRACT_MD, CONTRACT_JSON}
    touched_contract_paths = contract_paths.intersection(changed_files)
    sensitive_changed = [
        path.as_posix()
        for path in changed_files
        if path not in contract_paths and _path_is_sensitive(path, sensitive_paths, diff_by_path)
    ]

    if sensitive_changed and touched_contract_paths != contract_paths:
        missing_contract_paths = sorted(
            path.as_posix() for path in contract_paths - touched_contract_paths
        )
        return [
            Finding(
                "authz_contract_not_updated",
                "Authz-sensitive files changed without updating "
                f"both {CONTRACT_MD} and {CONTRACT_JSON}. Missing: "
                f"{', '.join(missing_contract_paths)}. Sensitive changes: "
                f"{', '.join(sensitive_changed)}",
            )
        ]
    return []


def _validate_frontend_local_gate_classifications(
    changed_files: list[Path],
    diff_by_path: Mapping[Path, str] | None = None,
    classifications: Mapping[str, FrontendLocalGateClassification] | None = None,
) -> list[Finding]:
    findings: list[Finding] = []
    classified = dict(FRONTEND_LOCAL_GATE_CLASSIFICATIONS if classifications is None else classifications)

    for path in changed_files:
        path_posix = path.as_posix()
        if not path_posix.startswith("frontend/src/") or path.suffix not in FRONTEND_SOURCE_SUFFIXES:
            continue

        local_gate_lines: list[str] = []
        if diff_by_path is not None:
            diff_text = diff_by_path.get(path, "")
            if diff_text:
                local_gate_lines = _frontend_local_gate_lines_from_diff(diff_text)
            elif _repo_path(path).exists():
                local_gate_lines = _frontend_local_gate_lines_from_source(path)
        elif _repo_path(path).exists():
            local_gate_lines = _frontend_local_gate_lines_from_source(path)

        if not local_gate_lines:
            continue

        classification = classified.get(path_posix)
        if classification is None:
            findings.append(
                Finding(
                    "frontend_local_gate_not_classified",
                    f"{path_posix} changes local frontend authorization tokens "
                    "(hasPermission/usePermissions/PermissionGate) but is not classified as a "
                    "route, nav, read/session gate, or documented capability exception. Add a "
                    "backend-capability contract reference or classify the local gate with a reason.",
                )
            )
            continue

        allowed_patterns = classification["allowed_patterns"]
        disallowed_lines = [
            line
            for line in local_gate_lines
            if not _line_matches_any_pattern(line, allowed_patterns)
        ]
        if disallowed_lines:
            findings.append(
                Finding(
                    "frontend_local_gate_not_allowed",
                    f"{path_posix} changes a local frontend authorization gate outside its "
                    f"classified allowance ({classification['reason']}): {disallowed_lines[0]!r}. "
                    "Use backend capability metadata for protected actions or add a narrower "
                    "documented local-gate pattern.",
                )
            )
    return findings


def validate(base_ref: str, skip_doc_touch: bool) -> list[Finding]:
    return authz_runner.run_validation(
        base_ref=base_ref,
        capability_catalog_path=CAPABILITY_CATALOG_JSON,
        changed_file_diffs=_changed_file_diffs,
        changed_files=_changed_files,
        contract_json_path=CONTRACT_JSON,
        contract_md_path=CONTRACT_MD,
        load_json=_load_json,
        path_exists=lambda path: _repo_path(path).is_file(),
        read_text=lambda path: _repo_path(path).read_text(encoding="utf-8"),
        skip_doc_touch=skip_doc_touch,
        validate_business_route_nav_context=_validate_business_route_nav_context,
        validate_capability_catalog=_validate_capability_catalog,
        validate_doc_touch=_validate_doc_touch,
        validate_frontend_local_gate_classifications=_validate_frontend_local_gate_classifications,
        validate_manifest=_validate_manifest,
        validate_markdown=_validate_markdown,
    )


def main() -> int:
    return authz_cli.run_cli(validate)


if __name__ == "__main__":
    raise SystemExit(main())
