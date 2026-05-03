"""Validation runner for the authorization/capability contract."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from .models import Finding


def run_validation(
    *,
    base_ref: str,
    capability_catalog_path: Path,
    contract_json_path: Path,
    contract_md_path: Path,
    load_json: Callable[[Path], Any],
    path_exists: Callable[[Path], bool],
    read_text: Callable[[Path], str],
    skip_doc_touch: bool,
    validate_business_route_nav_context: Callable[[], list[Finding]],
    validate_capability_catalog: Callable[[Any], list[Finding]],
    validate_doc_touch: Callable[[list[Path], list[str], Mapping[Path, str] | None], list[Finding]],
    validate_frontend_local_gate_classifications: Callable[
        [list[Path], Mapping[Path, str] | None],
        list[Finding],
    ],
    validate_manifest: Callable[[Any], tuple[set[str], list[str], list[Finding]]],
    validate_markdown: Callable[[str, list[dict[str, Any]]], list[Finding]],
    changed_file_diffs: Callable[[str], dict[Path, str]],
    changed_files: Callable[[str], list[Path]],
) -> list[Finding]:
    findings: list[Finding] = []
    if not path_exists(contract_md_path):
        findings.append(Finding("missing_contract_markdown", contract_md_path.as_posix()))
        return findings
    if not path_exists(contract_json_path):
        findings.append(Finding("missing_contract_manifest", contract_json_path.as_posix()))
        return findings
    if not path_exists(capability_catalog_path):
        findings.append(Finding("missing_capability_catalog", capability_catalog_path.as_posix()))
        return findings

    manifest = load_json(contract_json_path)
    _, sensitive_paths, manifest_findings = validate_manifest(manifest)
    findings.extend(manifest_findings)

    capability_catalog = load_json(capability_catalog_path)
    findings.extend(validate_capability_catalog(capability_catalog))

    actions = manifest.get("actions") if isinstance(manifest, dict) else []
    findings.extend(validate_markdown(read_text(contract_md_path), actions if isinstance(actions, list) else []))
    findings.extend(validate_business_route_nav_context())

    if not skip_doc_touch:
        changed_paths = changed_files(base_ref)
        changed_diffs = changed_file_diffs(base_ref)
        findings.extend(validate_doc_touch(changed_paths, sensitive_paths, changed_diffs))
        findings.extend(validate_frontend_local_gate_classifications(changed_paths, changed_diffs))

    return findings
