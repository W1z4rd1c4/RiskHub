#!/usr/bin/env python3
"""CLI adapter and compatibility imports for authz/capability validation."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Mapping

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from authz_contract_validator import capability_catalog as capability_catalog_validator  # noqa: E402
from authz_contract_validator import cli as authz_cli  # noqa: E402
from authz_contract_validator import contract_manifest  # noqa: E402
from authz_contract_validator import discovery  # noqa: E402
from authz_contract_validator import frontend_local_gates  # noqa: E402
from authz_contract_validator import frontend_routes as frontend_route_validator  # noqa: E402
from authz_contract_validator import git_inputs as git_input_collector  # noqa: E402
from authz_contract_validator import markdown_validation  # noqa: E402
from authz_contract_validator import runner as authz_runner  # noqa: E402
from authz_contract_validator.models import (  # noqa: E402
    ContractPathReference as AuthzContractPathReference,
    DiscoveredAuthzPath as AuthzDiscoveredAuthzPath,
    Finding as AuthzFinding,
)

CONTRACT_MD = Path("docs/security/authorization-capability-contract.md")
CONTRACT_JSON = Path("docs/security/authorization-capability-contract.json")
CAPABILITY_CATALOG_JSON = Path("docs/security/capability-catalog.json")

Finding = AuthzFinding
ContractPathReference = AuthzContractPathReference
DiscoveredAuthzPath = AuthzDiscoveredAuthzPath


def _repo_path(path: Path) -> Path:
    return REPO_ROOT / path


def _load_json(path: Path) -> Any:
    try:
        return json.loads(_repo_path(path).read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: invalid JSON: {exc}") from exc


def _run_git(*args: str):
    return git_input_collector.run_git(REPO_ROOT, *args)


def _changed_files(base_ref: str) -> list[Path]:
    return git_input_collector.changed_files(REPO_ROOT, base_ref)


def _changed_file_diffs(base_ref: str) -> dict[Path, str]:
    return git_input_collector.changed_file_diffs(REPO_ROOT, base_ref)


_validate_manifest = lambda manifest, *, run_discovery=True: contract_manifest.validate_manifest(
    manifest,
    repo_root=REPO_ROOT,
    run_discovery=run_discovery,
)
_validate_doc_touch = lambda changed_files, sensitive_paths, diff_by_path=None: contract_manifest.validate_doc_touch(
    changed_files,
    sensitive_paths,
    diff_by_path,
    contract_md=CONTRACT_MD,
    contract_json=CONTRACT_JSON,
)

_extract_contract_matrix_rows = markdown_validation.extract_contract_matrix_rows
_validate_markdown = markdown_validation.validate_markdown

_read_source = lambda path: discovery.read_source(path, REPO_ROOT)
_discover_authz_paths = lambda: discovery.discover_authz_paths(REPO_ROOT)
_validate_discovered_authz_paths = lambda contract_paths, sensitive_paths, discoveries=None, allowlist=None: (
    discovery.validate_discovered_authz_paths(
        contract_paths,
        sensitive_paths,
        discoveries,
        allowlist,
        repo_root=REPO_ROOT,
    )
)

_validate_frontend_local_gate_classifications = (
    lambda changed_files, diff_by_path=None, classifications=None: (
        frontend_local_gates.validate_frontend_local_gate_classifications(
            changed_files,
            diff_by_path,
            classifications,
            repo_root=REPO_ROOT,
        )
    )
)

_validate_business_route_nav_context = frontend_route_validator.validate_business_route_nav_context

_read_catalog_source = capability_catalog_validator._read_catalog_source
_extract_python_class_body = capability_catalog_validator._extract_python_class_body
_extract_backend_capability_fields = capability_catalog_validator._extract_backend_capability_fields
_find_matching_closing_brace = capability_catalog_validator._find_matching_closing_brace
_extract_typescript_schema_body = capability_catalog_validator._extract_typescript_schema_body
_extract_frontend_capability_fields = capability_catalog_validator._extract_frontend_capability_fields
_validate_capability_catalog = capability_catalog_validator.validate_capability_catalog

globals()["BACKEND" + "_ENDPOINT_AUTHZ_PATTERN"] = getattr(
    discovery,
    "BACKEND" + "_ENDPOINT_AUTHZ_PATTERN",
)
globals()["FRONTEND" + "_AUTHZ_TOKEN_PATTERN"] = getattr(
    contract_manifest,
    "FRONTEND" + "_AUTHZ_TOKEN_PATTERN",
)


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
