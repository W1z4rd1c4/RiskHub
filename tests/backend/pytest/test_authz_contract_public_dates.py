"""Public CLI date/typed catalog contracts; reconstructed candidate evidence."""

from __future__ import annotations

import json
import re
import runpy
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = Path("scripts/security/validate_authz_capability_contract.py")
MD = Path("docs/security/authorization-capability-contract.md")
MANIFEST = Path("docs/security/authorization-capability-contract.json")
CATALOG = Path("docs/security/capability-catalog.json")


@pytest.fixture(scope="module")
def cli_repo(tmp_path_factory):
    """Minimal synthetic repository, executing the unchanged public CLI and validators."""
    root = tmp_path_factory.mktemp("authz-public-cli")
    shutil.copytree(
        ROOT / "scripts/security",
        root / "scripts/security",
        ignore=shutil.ignore_patterns("__pycache__"),
    )
    fields = (
        "id",
        "surface",
        "action",
        "actor_scope",
        "backend_authority",
        "service_policy",
        "response_capability",
        "frontend_gate",
        "status",
        "findings",
        "tests",
    )
    headers = (
        "ID",
        "Surface",
        "Action",
        "Actor scope",
        "Backend authority",
        "Service policy",
        "Response capability",
        "Frontend gate",
        "Status",
        "Findings",
        "Tests",
    )
    backend = "backend/app/schemas/synthetic.py"
    frontend = "frontend/src/synthetic.ts"
    action = dict(
        zip(
            fields,
            (
                "AUTHZ-SYNTHETIC",
                "Synthetic",
                "Read",
                "Authenticated",
                backend,
                "Backend policy",
                "Typed catalog",
                frontend,
                "authoritative",
                [],
                ["tests/test_synthetic.py"],
            ),
            strict=True,
        )
    )
    manifest = {
        "version": "1.0",
        "last_reviewed": "2026-10-02",
        "last_architecture_refactor_reviewed": "2020-01-01",
        "sensitive_change_paths": [backend, frontend],
        "actions": [action],
    }
    sections = (
        "Purpose",
        "Architecture Principles",
        "Vocabulary",
        "Maintenance Rule",
        "Contract Matrix",
        "Capability Gap Register",
        "Evidence Map",
        "Required Verification",
        "Out Of Scope",
    )
    markdown = "> Last reviewed: 2026-10-02\nUnrelated prose date: 1999-01-01\n"
    for section in sections:
        markdown += "\n## " + section + "\n"
        if section == "Contract Matrix":
            values = [
                "None"
                if field == "findings"
                else "tests/test_synthetic.py"
                if field == "tests"
                else str(action[field])
                for field in fields
            ]
            markdown += (
                "| "
                + " | ".join(headers)
                + " |\n| "
                + " | ".join("---" for _ in fields)
                + " |\n"
            )
            markdown += "| " + " | ".join(values) + " |\n"
    catalog = {
        "surfaces": [
            {
                "id": "synthetic",
                "backend": {"path": backend, "class": "SyntheticCapabilities"},
                "frontend": {"path": frontend, "schema": "syntheticCapabilitiesSchema"},
                "fields": ["can_read", "managed_fields"],
                "string_array_fields": ["managed_fields"],
            }
        ]
    }
    files = {
        str(MD): markdown,
        str(MANIFEST): json.dumps(manifest),
        str(CATALOG): json.dumps(catalog),
        backend: ("from pydantic import BaseModel\nclass SyntheticCapabilities(BaseModel):\n"
                  "    can_read: bool\n    managed_fields: list[str]\n"),
        frontend: ("export const syntheticCapabilitiesSchema = passthroughObject({\n"
                   "  can_read: z.boolean(),\n  managed_fields: z.array(z.string()),\n});\n"),
        "frontend/src/routing/business.tsx": "export const businessRoutes = [];\n",
        "tests/test_synthetic.py": "def test_contract(): pass\n",
    }
    for path, content in files.items():
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    for args in (
        ("init", "-q"),
        ("add", "."),
        (
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-qm",
            "baseline",
        ),
    ):
        subprocess.run(
            ["git", *args], cwd=root, check=True, capture_output=True, timeout=30
        )
    return root


@pytest.fixture
def documents(cli_repo):
    originals = {
        path: (cli_repo / path).read_text()
        for path in (MD, MANIFEST, CATALOG, Path("frontend/src/synthetic.ts"))
    }
    yield cli_repo, originals
    for path, source in originals.items():
        (cli_repo / path).write_text(source)


def _run(root, mode):
    return subprocess.run(
        [sys.executable, str(root / SCRIPT), *mode],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=45,
    )


@pytest.mark.parametrize("mode", [("--skip-doc-touch",), ("--base-ref", "HEAD")])
@pytest.mark.parametrize(
    "mutation",
    [
        "unchanged",
        "paired",
        "mismatch",
        "missing_md",
        "missing_json",
        "duplicate_md",
        "duplicate_json",
        "invalid",
        "leap",
        "malformed",
    ],
)
def test_public_cli_review_date_contract(documents, mode, mutation):
    root, original = documents
    md, manifest = original[MD], original[MANIFEST]
    if mutation in {"paired", "leap", "invalid", "malformed"}:
        date = {
            "paired": "2026-10-03",
            "leap": "2024-02-29",
            "invalid": "2025-02-29",
            "malformed": "2026-2-03",
        }[mutation]
        md = re.sub(r"^> Last reviewed:.*$", "> Last reviewed: " + date, md, flags=re.M)
        obj = json.loads(manifest)
        obj["last_reviewed"] = date
        manifest = json.dumps(obj)
    elif mutation == "mismatch":
        md = md.replace("> Last reviewed: 2026-10-02", "> Last reviewed: 2026-10-03")
    elif mutation == "missing_md":
        md = re.sub(r"^> Last reviewed:.*\n", "", md, flags=re.M)
    elif mutation == "missing_json":
        obj = json.loads(manifest)
        del obj["last_reviewed"]
        manifest = json.dumps(obj)
    elif mutation == "duplicate_md":
        md += "\n> Last reviewed: 2026-10-02\n"
    elif mutation == "duplicate_json":
        manifest = manifest.replace("{", '{"last_reviewed":"2026-10-02",', 1)
    (root / MD).write_text(md)
    (root / MANIFEST).write_text(manifest)
    result = _run(root, mode)
    if mutation in {"unchanged", "paired", "leap"}:
        assert result.returncode == 0, result.stdout + result.stderr
    else:
        assert result.returncode != 0
        expected = {
            "mismatch": "review_date_mismatch",
            "missing_md": "review_date_markdown_declaration",
            "missing_json": "review_date_manifest_declaration",
            "duplicate_md": "review_date_markdown_declaration",
            "duplicate_json": "review_date_manifest_declaration",
            "invalid": "review_date_markdown_invalid",
            "malformed": "review_date_markdown_invalid",
        }[mutation]
        assert expected in result.stdout + result.stderr


@pytest.mark.parametrize("mode", [("--skip-doc-touch",), ("--base-ref", "HEAD")])
def test_public_cli_typed_identity_array_remains_checked(documents, mode):
    root, original = documents
    path = Path("frontend/src/synthetic.ts")
    assert _run(root, mode).returncode == 0
    (root / MD).write_text(original[MD] + "\nTyped field review.\n")
    (root / MANIFEST).write_text(original[MANIFEST] + "\n")
    (root / path).write_text(
        original[path].replace("z.array(z.string())", "z.array(z.number())")
    )
    result = _run(root, mode)
    assert result.returncode != 0, result.stdout
    assert (
        "capability_catalog_frontend_string_array_type" in result.stdout + result.stderr
    )
    assert "managed_fields" in result.stdout + result.stderr


RETIRED_ALIASES = (
    "_path_exists",
    "_path_is_covered_by_sensitive_paths",
    "_path_is_covered_by_contract_paths",
    "_extract_contract_path_references",
    "_extract_contract_paths",
    "_diff_has_frontend_authz_tokens",
    "_is_exact_manifest_path",
    "_path_is_sensitive",
    "_format_manifest_findings",
    "_normalize_markdown_cell",
    "_split_markdown_row",
    "_parse_markdown_test_paths",
    "_diff_has_frontend_local_gate_tokens",
    "_frontend_local_gate_lines_from_diff",
    "_frontend_local_gate_lines_from_source",
    "_line_matches_any_pattern",
    "_normalize_typescript_expression",
    "_describe_business_nav_authority",
    "_extract_route_objects_from_array",
    "_extract_single_quoted_field",
    "_extract_is_visible_expression",
)


def test_retired_shim_aliases_have_no_repository_callers_and_reject_old_access(
    monkeypatch,
):
    """Inventory the actual removed assignments; import without leaking module state."""
    retired = set(RETIRED_ALIASES)
    tracked = (
        subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            timeout=10,
        )
        .stdout.decode()
        .split("\0")
    )
    for name in tracked:
        path = ROOT / name
        if (
            not name
            or path.suffix not in {".py", ".ts", ".tsx", ".sh"}
            or path in {ROOT / SCRIPT, Path(__file__)}
        ):
            continue
        source = path.read_text()
        for alias in retired:
            assert not re.search(r"\b" + re.escape(alias) + r"\b", source), (
                path,
                alias,
            )
    monkeypatch.setattr(sys, "path", list(sys.path))
    prefixes = ("authz_contract_validator", "authz_contract_manifest")
    saved = {
        key: value for key, value in sys.modules.items() if key.startswith(prefixes)
    }
    try:
        for key in saved:
            del sys.modules[key]
        module = runpy.run_path(str(ROOT / SCRIPT))
        assert callable(module["validate"]) and callable(module["main"])
        assert retired.isdisjoint(module)
    finally:
        for key in list(sys.modules):
            if key.startswith(prefixes):
                del sys.modules[key]
        sys.modules.update(saved)
    assert {
        key: value for key, value in sys.modules.items() if key.startswith(prefixes)
    } == saved
