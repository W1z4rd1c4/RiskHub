"""Public base-ref CLI behavior replaces fixture-coupled private validator calls."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from tests.backend.pytest._authz_cli_test_support import (
    CATALOG,
    MANIFEST,
    MD,
    SCRIPT,
    build_cli_repo,
)

BACKEND = Path("backend/app/schemas/synthetic.py")
FRONTEND = Path("frontend/src/synthetic.ts")


@pytest.fixture
def repo(tmp_path):
    return build_cli_repo(tmp_path)


def run(root, *args):
    return subprocess.run(
        [sys.executable, str(root / SCRIPT), *args],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=30,
    )


def assert_result(result, reason=None):
    output = result.stdout + result.stderr
    assert result.returncode == (1 if reason else 0), output
    if reason:
        assert reason + ":" in output, output
    return output


def write(root, path, source):
    target = root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(source)


def git(root, *args):
    return subprocess.run(
        ["git", *args], cwd=root, check=True, capture_output=True, text=True, timeout=20
    )


def commit(root):
    git(root, "add", ".")
    git(
        root,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-qm",
        "fixture setup",
    )


def touch_docs(root, choice="both"):
    for path in (
        [MD, MANIFEST]
        if choice == "both"
        else [MD]
        if choice == "md"
        else [MANIFEST]
        if choice == "json"
        else []
    ):
        write(root, path, (root / path).read_text() + "\n")


def manifest(root, **changes):
    obj = json.loads((root / MANIFEST).read_text())
    obj.update(changes)
    write(root, MANIFEST, json.dumps(obj))
    return obj


def register_authority(root, path, *, contractual=True, sensitive=True):
    obj = json.loads((root / MANIFEST).read_text())
    if contractual:
        old = obj["actions"][0]["service_policy"]
        obj["actions"][0]["service_policy"] = path
        write(root, MD, (root / MD).read_text().replace(old, path))
    if sensitive:
        obj["sensitive_change_paths"].append(path)
    write(root, MANIFEST, json.dumps(obj))


@pytest.mark.parametrize("mode", [("--skip-doc-touch",), ("--base-ref", "HEAD")])
@pytest.mark.parametrize(
    "field",
    [
        "surface",
        "actor_scope",
        "backend_authority",
        "service_policy",
        "findings",
        "tests",
    ],
)
def test_matrix_mismatch_uses_exact_cells(repo, mode, field):
    obj = json.loads((repo / MANIFEST).read_text())
    value = obj["actions"][0][field]
    old = "None" if field == "findings" else value[0] if field == "tests" else value
    replacement = "tests/other.py" if field == "tests" else "Changed " + old
    write(
        repo,
        MD,
        (repo / MD)
        .read_text()
        .replace("| " + old + " |", "| " + replacement + " |", 1),
    )
    reason = (
        "contract_matrix_tests_mismatch"
        if field == "tests"
        else "contract_matrix_field_mismatch"
    )
    assert_result(run(repo, *mode), reason)


def test_matrix_rejects_proper_substring_instead_of_treating_it_equal(repo):
    obj = json.loads((repo / MANIFEST).read_text())
    obj["actions"][0]["actor_scope"] = "Authenticated and scoped"
    write(repo, MANIFEST, json.dumps(obj))
    assert_result(run(repo, "--skip-doc-touch"), "contract_matrix_field_mismatch")


@pytest.mark.parametrize(
    "path", ["frontend/src/missing.ts", "frontend/src/services/reportsApi.ts"]
)
def test_missing_concrete_authority_path_is_reported(repo, path):
    register_authority(repo, path)
    output = assert_result(run(repo, "--skip-doc-touch"), "contract_path_missing")
    assert path in output


def test_declared_authority_must_be_sensitive(repo):
    manifest(repo, sensitive_change_paths=[str(FRONTEND)])
    output = assert_result(
        run(repo, "--skip-doc-touch"), "authority_path_not_sensitive"
    )
    assert str(BACKEND) in output


@pytest.mark.parametrize(
    "path,source",
    [
        (
            "backend/app/api/v1/endpoints/example.py",
            "guard = require_permission('risks', 'read')\n",
        ),
        (
            "backend/app/api/v1/endpoints/example.py",
            "def _require_directory_admin(): pass\n",
        ),
        (
            "backend/app/api/v1/endpoints/example.py",
            "def _require_custom_admin(): pass\n",
        ),
        ("frontend/src/pages/ExamplePage.tsx", "const x = <PermissionGate />;\n"),
    ],
)
@pytest.mark.parametrize(
    "contractual,sensitive",
    [(False, False), (False, True), (True, False), (True, True)],
)
def test_discovery_requires_both_coverage_dimensions(
    repo, path, source, contractual, sensitive
):
    write(repo, path, source)
    register_authority(repo, path, contractual=contractual, sensitive=sensitive)
    git(repo, "add", path)
    result = run(repo, "--skip-doc-touch")
    if contractual and sensitive:
        assert_result(result)
    else:
        output = result.stdout + result.stderr
        assert result.returncode == 1, output
        if not contractual:
            assert "discovered_authz_path_not_contractual:" in output
        if not sensitive:
            assert "discovered_authz_path_not_sensitive:" in output


def test_documented_non_authoritative_support_discovery_is_allowed(repo):
    path = "frontend/src/hooks/useUsersPageFilters.ts"
    write(repo, path, "const filter = hasPermission('users', 'read');\n")
    git(repo, "add", path)
    assert_result(run(repo, "--skip-doc-touch"))


@pytest.mark.parametrize(
    "side,type_text,reason",
    [
        ("backend", None, "capability_catalog_backend_field_missing"),
        ("frontend", None, "capability_catalog_frontend_field_missing"),
        ("backend", "str", "capability_catalog_backend_field_missing"),
        ("frontend", "z.string()", "capability_catalog_frontend_field_missing"),
    ],
)
@pytest.mark.parametrize("mode", [("--skip-doc-touch",), ("--base-ref", "HEAD")])
def test_catalog_boolean_field_shape_failures(repo, side, type_text, reason, mode):
    path = BACKEND if side == "backend" else FRONTEND
    old = "    can_read: bool\n" if side == "backend" else "  can_read: z.boolean(),\n"
    new = (
        ""
        if type_text is None
        else (
            "    can_read: " + type_text + "\n"
            if side == "backend"
            else "  can_read: " + type_text + ",\n"
        )
    )
    source = (repo / path).read_text()
    assert old in source
    write(repo, path, source.replace(old, new))
    touch_docs(repo)
    assert_result(run(repo, *mode), reason)


@pytest.mark.parametrize(
    "side,type_text",
    [
        ("backend", "list[int]"),
        ("backend", "bool"),
        ("backend", "dict[str, bool]"),
        ("backend", "object"),
        ("frontend", "z.array(z.number())"),
        ("frontend", "z.boolean()"),
        ("frontend", "z.record(z.string(), z.boolean())"),
        ("frontend", "z.any()"),
        ("frontend", "z.array(z.string()).or(z.number())"),
        ("frontend", "z.array(z.string()).nullable()"),
        ("frontend", "z.array(z.string()).transform(() => 1)"),
    ],
)
def test_catalog_opt_in_string_arrays_are_typed(repo, side, type_text):
    path = BACKEND if side == "backend" else FRONTEND
    old = "list[str]" if side == "backend" else "z.array(z.string())"
    write(repo, path, (repo / path).read_text().replace(old, type_text))
    assert_result(
        run(repo, "--skip-doc-touch"), f"capability_catalog_{side}_string_array_type"
    )


@pytest.mark.parametrize("valid", [True, False])
def test_catalog_registered_boolean_map_is_typed(repo, valid):
    obj = json.loads((repo / CATALOG).read_text())
    surface = obj["surfaces"][0]
    surface["id"] = "me_capabilities"
    surface["fields"].append("resource_permissions")
    write(repo, CATALOG, json.dumps(obj))
    write(
        repo,
        BACKEND,
        (repo / BACKEND).read_text() + "    resource_permissions: dict[str, bool]\n",
    )
    value = "z.boolean()" if valid else "z.string()"
    write(
        repo,
        FRONTEND,
        (repo / FRONTEND)
        .read_text()
        .replace(
            "});", "  resource_permissions: z.record(z.string(), " + value + "),\n});"
        ),
    )
    assert_result(
        run(repo, "--skip-doc-touch"),
        None if valid else "capability_catalog_frontend_field_missing",
    )


@pytest.mark.parametrize("choice", ["none", "md", "json", "both"])
def test_real_base_ref_requires_both_documents_on_sensitive_change(repo, choice):
    write(repo, BACKEND, (repo / BACKEND).read_text() + "# authority change\n")
    touch_docs(repo, choice)
    assert_result(
        run(repo, "--base-ref", "HEAD"),
        None if choice == "both" else "authz_contract_not_updated",
    )


@pytest.mark.parametrize(
    "path",
    [
        "backend/app/api/v1/endpoints/directory.py",
        "backend/app/services/_directory_identity/identity.py",
        "backend/app/services/ad_deprovision_service.py",
        "backend/app/services/directory_provider_service.py",
        "backend/app/services/_graph_directory/client.py",
        "backend/app/db/rbac_seed_contract.py",
        "backend/app/services/sso_token_service.py",
        "frontend/src/services/accessApi.ts",
    ],
)
def test_explicit_sensitive_paths_use_actual_git_changes(repo, path):
    write(repo, path, "# before\n")
    obj = json.loads((repo / MANIFEST).read_text())
    obj["sensitive_change_paths"].append(path)
    write(repo, MANIFEST, json.dumps(obj))
    commit(repo)
    write(repo, path, "# after\n")
    output = assert_result(
        run(repo, "--base-ref", "HEAD"), "authz_contract_not_updated"
    )
    assert path in output


@pytest.mark.parametrize("change", ["add", "remove", "ordinary", "untracked"])
def test_broad_frontend_scope_uses_real_diff_and_untracked_source(repo, change):
    path = "frontend/src/pages/ExamplePage.tsx"
    before = (
        "const value = useAuthz().canWriteRisks;\n"
        if change == "remove"
        else "const label = 'before';\n"
    )
    write(repo, path, before)
    register_authority(repo, path)
    obj = json.loads((repo / MANIFEST).read_text())
    obj["sensitive_change_paths"] = [str(BACKEND), str(FRONTEND), "frontend/src/pages/"]
    write(repo, MANIFEST, json.dumps(obj))
    commit(repo)
    if change == "untracked":
        path = "frontend/src/pages/UntrackedActionPage.tsx"
        write(repo, path, "const canDelete = hasPermission('risks', 'delete');\n")
    else:
        write(
            repo,
            path,
            "const label = 'after';\n"
            if change in {"remove", "ordinary"}
            else "const value = useAuthz().canWriteRisks;\n",
        )
    result = run(repo, "--base-ref", "HEAD")
    if change == "ordinary":
        assert_result(result)
    else:
        output = assert_result(
            result,
            "frontend_local_gate_not_classified"
            if change == "untracked"
            else "authz_contract_not_updated",
        )
        if change == "untracked":
            assert "frontend_local_gate_not_classified:" in output


@pytest.mark.parametrize(
    "kind", ["unclassified", "classified_allowed", "classified_wrong", "deleted"]
)
def test_local_action_gate_classification_through_public_cli(repo, kind):
    path = (
        "frontend/src/components/layout/Sidebar.tsx"
        if kind.startswith("classified")
        else "frontend/src/pages/ActionPage.tsx"
    )
    write(
        repo,
        path,
        "const canDeleteRisk = hasPermission('risks', 'delete');\n"
        if kind == "deleted"
        else "// before\n",
    )
    register_authority(repo, path)
    commit(repo)
    source = (
        "const { user, logout, logoutPending, logoutErrorKey, hasPermission } = useAuth();\n"
        if kind == "classified_allowed"
        else "// removed\n"
        if kind == "deleted"
        else "const canDeleteRisk = hasPermission('risks', 'delete');\n"
    )
    write(repo, path, source)
    touch_docs(repo)
    assert_result(
        run(repo, "--base-ref", "HEAD"),
        "frontend_local_gate_not_classified"
        if kind == "unclassified"
        else "frontend_local_gate_not_allowed"
        if kind == "classified_wrong"
        else None,
    )


@pytest.mark.parametrize(
    "key,expression,valid",
    [
        ("controls", "!authz.isPlatformAdmin && authz.can('read', 'controls')", True),
        ("controls", "authz.can('read', 'risks')", False),
        ("kris", "!authz.isPlatformAdmin && authz.can('read', 'risks')", True),
        ("kris", "!authz.isPlatformAdmin && authz.can('read', 'departments')", False),
        ("approvals", "authz.canViewApprovals", True),
        (
            "approvals",
            "authz.canViewApprovals && hasPermission('controls', 'read')",
            False,
        ),
        ("notifications", None, True),
    ],
)
def test_business_navigation_preserves_its_distinct_authority(
    repo, key, expression, valid
):
    nav = (
        ""
        if expression is None
        else "nav: { isVisible: ({ authz }) => " + expression + ", order: 1 },"
    )
    write(
        repo,
        "frontend/src/routing/business.tsx",
        "export const businessRoutes = [{ key: '"
        + key
        + "', path: '"
        + key
        + "', "
        + nav
        + "}];\n",
    )
    assert_result(
        run(repo, "--skip-doc-touch"),
        None if valid else "frontend_business_nav_gate_mismatch",
    )


@pytest.mark.parametrize(
    "args,expected",
    [
        (("--skip-doc-touch", "backend/app/core/security.py"), 0),
        (("--base-ref", "missing-ref"), 2),
        (("--unknown-option",), 2),
    ],
)
def test_public_cli_arguments_and_failure_exits(repo, args, expected):
    result = run(repo, *args)
    assert result.returncode == expected, result.stdout + result.stderr


@pytest.mark.parametrize("side", ["backend", "frontend"])
def test_catalog_array_field_cannot_disappear(repo, side):
    path = BACKEND if side == "backend" else FRONTEND
    write(
        repo,
        path,
        "\n".join(
            line
            for line in (repo / path).read_text().splitlines()
            if "managed_fields:" not in line
        ),
    )
    assert_result(
        run(repo, "--skip-doc-touch"), f"capability_catalog_{side}_string_array_type"
    )


def test_array_registration_remains_explicit_opt_in(repo):
    obj = json.loads((repo / CATALOG).read_text())
    del obj["surfaces"][0]["string_array_fields"]
    write(repo, CATALOG, json.dumps(obj))
    output = assert_result(
        run(repo, "--skip-doc-touch"),
        "capability_catalog_backend_string_array_undeclared",
    )
    assert "capability_catalog_frontend_string_array_undeclared:" in output


@pytest.mark.parametrize("missing", [MD, MANIFEST, CATALOG])
def test_public_cli_missing_inputs_fail_clearly(repo, missing):
    (repo / missing).unlink()
    reason = {
        MD: "missing_contract_markdown",
        MANIFEST: "missing_contract_manifest",
        CATALOG: "missing_capability_catalog",
    }[missing]
    assert_result(run(repo, "--skip-doc-touch"), reason)


def test_public_cli_invalid_json_is_runtime_error(repo):
    write(repo, MANIFEST, "{invalid")
    result = run(repo, "--skip-doc-touch")
    assert result.returncode == 2
    assert "authorization capability contract validation failed:" in result.stderr
    assert "line 1 column 2" in result.stderr
