"""Markdown contract matrix validation for authz/capability docs."""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Any

from .contract_manifest import format_manifest_findings
from .models import Finding

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


def normalize_markdown_cell(value: str) -> str:
    value = value.replace("`", "").replace("&nbsp;", " ")
    value = re.sub(r"<br\s*/?>", " ", value, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", value).strip()


def split_markdown_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def extract_contract_matrix_rows(md_text: str) -> tuple[list[str], list[dict[str, str]], list[Finding]]:
    findings: list[Finding] = []
    section_marker = "## Contract Matrix"
    try:
        section_start = md_text.index(section_marker)
    except ValueError:
        return [], [], [Finding("missing_markdown_section", section_marker)]

    next_section = md_text.find("\n## ", section_start + len(section_marker))
    section_text = md_text[section_start : next_section if next_section != -1 else len(md_text)]
    table_lines = [line for line in section_text.splitlines() if line.startswith("|")]
    if len(table_lines) < 2:
        return [], [], [Finding("missing_contract_matrix", "Contract Matrix table not found")]

    headers = split_markdown_row(table_lines[0])
    expected_headers = list(MATRIX_FIELD_MAP)
    if headers != expected_headers:
        findings.append(Finding("contract_matrix_headers", f"expected {expected_headers}; found {headers}"))
        return headers, [], findings

    rows: list[dict[str, str]] = []
    for line in table_lines[2:]:
        cells = split_markdown_row(line)
        if len(cells) != len(headers):
            findings.append(Finding("contract_matrix_row_shape", line))
            continue
        rows.append(dict(zip(headers, cells, strict=True)))
    return headers, rows, findings


def parse_markdown_test_paths(value: str) -> set[str]:
    normalized = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    normalized = normalized.replace("`", "")
    return {line.strip() for line in normalized.splitlines() if line.strip()}


def validate_review_dates(md_text: str, manifest_text: str) -> list[Finding]:
    """Validate the two explicit review declarations without discarding duplicates."""
    findings: list[Finding] = []
    markdown_dates = re.findall(
        r"^> Last reviewed:[ \t]*(.*?)[ \t]*$", md_text, re.MULTILINE
    )
    # Keep top-level object pairs: ordinary decoding would lose duplicate keys.
    pairs = json.loads(manifest_text, object_pairs_hook=lambda entries: entries)
    manifest_dates = (
        [value for key, value in pairs if key == "last_reviewed"]
        if manifest_text.lstrip().startswith("{")
        else []
    )
    values = {}
    for source, declarations in (
        ("markdown", markdown_dates),
        ("manifest", manifest_dates),
    ):
        if len(declarations) != 1:
            findings.append(
                Finding(
                    f"review_date_{source}_declaration",
                    "expected exactly one review date declaration",
                )
            )
            continue
        value = declarations[0]
        if (
            not isinstance(value, str)
            or re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) is None
        ):
            findings.append(
                Finding(
                    f"review_date_{source}_invalid",
                    "expected an ISO YYYY-MM-DD calendar date",
                )
            )
            continue
        try:
            date.fromisoformat(value)
        except ValueError:
            findings.append(
                Finding(
                    f"review_date_{source}_invalid",
                    "expected an ISO YYYY-MM-DD calendar date",
                )
            )
            continue
        values[source] = value
    if len(values) == 2 and values["markdown"] != values["manifest"]:
        findings.append(
            Finding(
                "review_date_mismatch",
                f"markdown={values['markdown']} manifest={values['manifest']}",
            )
        )
    return findings


def validate_markdown(md_text: str, actions: list[dict[str, Any]]) -> list[Finding]:
    findings: list[Finding] = []
    for section in REQUIRED_MD_SECTIONS:
        if section not in md_text:
            findings.append(Finding("missing_markdown_section", section))

    _, matrix_rows, matrix_findings = extract_contract_matrix_rows(md_text)
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
        findings.append(Finding("manifest_ids_missing_from_markdown", ", ".join(missing_in_md)))
    if extra_in_md:
        findings.append(Finding("markdown_ids_missing_from_manifest", ", ".join(extra_in_md)))

    for action_id in sorted(manifest_ids & markdown_ids):
        markdown_row = matrix_by_id[action_id]
        action = manifest_by_id[action_id]
        for header, field in MATRIX_FIELD_MAP.items():
            markdown_value = markdown_row.get(header, "")
            if field == "tests":
                markdown_tests = parse_markdown_test_paths(markdown_value)
                manifest_tests = set(action.get("tests", []))
                if markdown_tests != manifest_tests:
                    findings.append(
                        Finding(
                            "contract_matrix_tests_mismatch",
                            f"{action_id}: markdown={sorted(markdown_tests)} manifest={sorted(manifest_tests)}",
                        )
                    )
                continue

            manifest_value = format_manifest_findings(action.get(field)) if field == "findings" else str(action.get(field, ""))
            if normalize_markdown_cell(markdown_value) != normalize_markdown_cell(manifest_value):
                findings.append(
                    Finding(
                        "contract_matrix_field_mismatch",
                        f"{action_id}.{field}: markdown={markdown_value!r} manifest={manifest_value!r}",
                    )
                )
    return findings


__all__ = [
    "Finding",
    "extract_contract_matrix_rows",
    "normalize_markdown_cell",
    "parse_markdown_test_paths",
    "split_markdown_row",
    "validate_markdown",
]
