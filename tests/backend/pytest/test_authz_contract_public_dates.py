"""Public CLI date/typed catalog contracts; reconstructed candidate evidence."""

from __future__ import annotations

import json
import re
import runpy
import subprocess
import sys
from pathlib import Path

import pytest

from tests.backend.pytest._authz_cli_test_support import build_cli_repo

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = Path("scripts/security/validate_authz_capability_contract.py")
MD = Path("docs/security/authorization-capability-contract.md")
MANIFEST = Path("docs/security/authorization-capability-contract.json")
CATALOG = Path("docs/security/capability-catalog.json")


@pytest.fixture(scope="module")
def cli_repo(tmp_path_factory):
    return build_cli_repo(tmp_path_factory.mktemp("authz-public-cli"))


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


# Explicitly retired adapter names. Same-name implementation APIs remain supported.
RETIRED_BRIDGES = (
    "_run_git", "_extract_contract_matrix_rows", "_read_source",
    "_discover_authz_paths", "_validate_discovered_authz_paths",
    "_read_catalog_source", "_extract_python_class_body",
    "_extract_backend_capability_fields", "_find_matching_closing_brace",
    "_extract_typescript_schema_body", "_extract_frontend_capability_fields",
    "BACKEND_ENDPOINT_AUTHZ_PATTERN", "FRONTEND_AUTHZ_TOKEN_PATTERN",
)

# These hits are canonical implementations, unrelated local helpers or anti-inline
# assertions. No production caller imports these names from the CLI adapter.
BRIDGE_REFERENCE_OWNERS = {
    "_run_git": {
        "scripts/security/validate_public_repo_hygiene.py",
        "tests/backend/pytest/test_repo_hygiene_contracts.py",
    },
    "_extract_contract_matrix_rows": {"tests/backend/pytest/test_authz_capability_contract_validator.py"},
    "_read_source": {
        "scripts/security/authz_contract_validator/capability_catalog.py",
        "scripts/security/authz_contract_validator/frontend_routes.py",
    },
    "_discover_authz_paths": {"tests/backend/pytest/test_authz_capability_contract_validator.py"},
    "_validate_discovered_authz_paths": set(),
    **{
        name: {"scripts/security/authz_contract_validator/capability_catalog.py"}
        for name in (
            "_read_catalog_source",
            "_extract_python_class_body",
            "_extract_backend_capability_fields",
            "_find_matching_closing_brace",
            "_extract_typescript_schema_body",
        )
    },
    "_extract_frontend_capability_fields": {
        "scripts/security/authz_contract_validator/capability_catalog.py",
        "tests/frontend/unit/src/services/api/schemas/__tests__/crudCapabilitySchema.parser.test.ts",
    },
    "BACKEND_ENDPOINT_AUTHZ_PATTERN": {
        "scripts/security/authz_contract_validator/discovery.py",
        "tests/backend/pytest/test_authz_capability_contract_validator.py",
    },
    "FRONTEND_AUTHZ_TOKEN_PATTERN": {
        "scripts/security/authz_contract_validator/contract_manifest.py",
        "tests/backend/pytest/test_authz_capability_contract_validator.py",
    },
}


def _unclassified_bridge_references(path, source):
    if path in {SCRIPT.as_posix(), Path(__file__).relative_to(ROOT).as_posix()}:
        return set()
    return {name for name in RETIRED_BRIDGES
            if re.search(r"(?<![A-Za-z0-9_])" + re.escape(name) + r"(?![A-Za-z0-9_])", source)
            and path not in BRIDGE_REFERENCE_OWNERS[name]}


def test_retired_bridges_have_no_unclassified_tracked_text_references():
    tracked = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, check=True,
                             capture_output=True, timeout=10).stdout.decode().split("\0")
    for name in filter(None, tracked):
        try:
            source = (ROOT / name).read_text()
        except UnicodeError:
            continue  # Binary assets cannot contain Python imports/string consumers.
        assert not _unclassified_bridge_references(name, source), name
    for alias in RETIRED_BRIDGES:
        for path in ("scripts/example.py", "docs/example.md", "frontend/src/example.ts"):
            assert _unclassified_bridge_references(path, f'getattr(validator, "{alias}")') == {alias}


def test_unused_adapter_bridges_are_absent_but_deep_owners_stay_available(monkeypatch):
    monkeypatch.setattr(sys, "path", list(sys.path))
    prefixes = ("authz_contract_validator", "authz_contract_manifest")
    saved = {key: value for key, value in sys.modules.items() if key.startswith(prefixes)}
    try:
        for key in saved:
            del sys.modules[key]
        module = runpy.run_path(str(ROOT / SCRIPT))
        assert set(RETIRED_BRIDGES).isdisjoint(module), set(RETIRED_BRIDGES) & module.keys()
        assert callable(module["validate"]) and callable(module["main"])
        from authz_contract_validator import capability_catalog, contract_manifest, discovery
        assert callable(capability_catalog._extract_frontend_capability_fields)
        assert callable(capability_catalog._extract_backend_capability_fields)
        assert discovery.BACKEND_ENDPOINT_AUTHZ_PATTERN
        assert contract_manifest.FRONTEND_AUTHZ_TOKEN_PATTERN
    finally:
        for key in list(sys.modules):
            if key.startswith(prefixes):
                del sys.modules[key]
        sys.modules.update(saved)
    assert {key: value for key, value in sys.modules.items() if key.startswith(prefixes)} == saved
