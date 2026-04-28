from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
VALIDATOR_PATH = REPO_ROOT / "scripts/security/validate_authz_capability_contract.py"
CONTRACT_MD_PATH = REPO_ROOT / "docs/security/authorization-capability-contract.md"
CONTRACT_JSON_PATH = REPO_ROOT / "docs/security/authorization-capability-contract.json"


def _load_validator():
    spec = importlib.util.spec_from_file_location(
        "validate_authz_capability_contract",
        VALIDATOR_PATH,
    )
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_authorization_capability_contract_is_valid() -> None:
    validator = _load_validator()

    assert validator.validate("HEAD", skip_doc_touch=True) == []


def test_markdown_matrix_field_drift_fails_validation() -> None:
    validator = _load_validator()
    manifest = json.loads(CONTRACT_JSON_PATH.read_text(encoding="utf-8"))
    markdown = CONTRACT_MD_PATH.read_text(encoding="utf-8").replace(
        "| AUTHZ-ACCESS-LIST | Access management |",
        "| AUTHZ-ACCESS-LIST | Access administration |",
        1,
    )

    findings = validator._validate_markdown(markdown, manifest["actions"])

    assert "contract_matrix_field_mismatch" in {finding.reason for finding in findings}


def test_markdown_matrix_test_evidence_drift_fails_validation() -> None:
    validator = _load_validator()
    manifest = json.loads(CONTRACT_JSON_PATH.read_text(encoding="utf-8"))
    markdown = CONTRACT_MD_PATH.read_text(encoding="utf-8").replace(
        "tests/frontend/unit/src/components/access/UsersTable.test.tsx",
        "tests/frontend/unit/src/components/access/StaleUsersTable.test.tsx",
        1,
    )

    findings = validator._validate_markdown(markdown, manifest["actions"])

    assert "contract_matrix_tests_mismatch" in {finding.reason for finding in findings}


def test_markdown_matrix_substring_drift_fails_validation() -> None:
    validator = _load_validator()
    manifest = json.loads(CONTRACT_JSON_PATH.read_text(encoding="utf-8"))
    markdown = CONTRACT_MD_PATH.read_text(encoding="utf-8").replace(
        "backend/app/api/v1/endpoints/risks/crud/create.py and backend/app/api/v1/endpoints/risks/crud/update.py",
        "backend/app/api/v1/endpoints/risks/crud/create.py",
        1,
    )

    findings = validator._validate_markdown(markdown, manifest["actions"])

    assert "contract_matrix_field_mismatch" in {finding.reason for finding in findings}


def test_markdown_matrix_actor_scope_drift_fails_validation() -> None:
    validator = _load_validator()
    manifest = json.loads(CONTRACT_JSON_PATH.read_text(encoding="utf-8"))
    markdown = CONTRACT_MD_PATH.read_text(encoding="utf-8").replace(
        "Requires users:read; visible user universe is scoped by backend user visibility policy",
        "Requires Admin",
        1,
    )

    findings = validator._validate_markdown(markdown, manifest["actions"])

    assert "contract_matrix_field_mismatch" in {finding.reason for finding in findings}


def test_markdown_matrix_service_policy_drift_fails_validation() -> None:
    validator = _load_validator()
    manifest = json.loads(CONTRACT_JSON_PATH.read_text(encoding="utf-8"))
    markdown = CONTRACT_MD_PATH.read_text(encoding="utf-8").replace(
        (
            "backend/app/core/permissions.py, backend/app/core/permission_cache.py, "
            "backend/app/api/v1/endpoints/users/_visibility.py"
        ),
        "backend/app/core/permissions.py",
        1,
    )

    findings = validator._validate_markdown(markdown, manifest["actions"])

    assert "contract_matrix_field_mismatch" in {finding.reason for finding in findings}


def test_markdown_matrix_findings_drift_fails_validation() -> None:
    validator = _load_validator()
    manifest = json.loads(CONTRACT_JSON_PATH.read_text(encoding="utf-8"))
    markdown = CONTRACT_MD_PATH.read_text(encoding="utf-8").replace(
        "| authoritative | None |",
        "| authoritative | P2: stale finding |",
        1,
    )

    findings = validator._validate_markdown(markdown, manifest["actions"])

    assert "contract_matrix_field_mismatch" in {finding.reason for finding in findings}


def test_missing_concrete_contract_path_fails_validation() -> None:
    validator = _load_validator()
    manifest = json.loads(CONTRACT_JSON_PATH.read_text(encoding="utf-8"))
    action = dict(manifest["actions"][0])
    action["frontend_gate"] = "frontend/src/services/reportsApi.ts"

    _, _, findings = validator._validate_manifest(
        {
            "actions": [action],
            "sensitive_change_paths": manifest["sensitive_change_paths"],
        },
        run_discovery=False,
    )

    assert "contract_path_missing" in {finding.reason for finding in findings}
    assert any("frontend/src/services/reportsApi.ts" in finding.detail for finding in findings)


def test_stale_reports_api_contract_reference_fails_validation() -> None:
    validator = _load_validator()
    manifest = json.loads(CONTRACT_JSON_PATH.read_text(encoding="utf-8"))
    reports_action = next(
        action for action in manifest["actions"] if action["id"] == "AUTHZ-REPORTS-EXPORTS"
    )
    stale_reports_action = {
        **reports_action,
        "frontend_gate": reports_action["frontend_gate"].replace("reportApi.ts", "reportsApi.ts"),
    }

    _, _, findings = validator._validate_manifest(
        {
            "actions": [stale_reports_action],
            "sensitive_change_paths": manifest["sensitive_change_paths"],
        },
        run_discovery=False,
    )

    assert "contract_path_missing" in {finding.reason for finding in findings}
    assert any("frontend/src/services/reportsApi.ts" in finding.detail for finding in findings)


def test_declared_authority_paths_must_be_sensitive() -> None:
    validator = _load_validator()
    action = {
        "id": "AUTHZ-TEST",
        "surface": "Test",
        "action": "Check coverage",
        "actor_scope": "Test",
        "backend_authority": "backend/app/api/v1/endpoints/executions.py",
        "service_policy": "backend/app/services/_control_execution/",
        "response_capability": "None",
        "frontend_gate": "frontend/src/components/executions/",
        "tests": ["tests/backend/pytest/test_executions.py"],
        "status": "authoritative",
        "findings": [],
    }

    _, _, findings = validator._validate_manifest(
        {
            "actions": [action],
            "sensitive_change_paths": [
                "backend/app/services/_control_execution/",
                "frontend/src/components/executions/",
            ],
        },
        run_discovery=False,
    )

    assert [finding.reason for finding in findings] == ["authority_path_not_sensitive"]
    assert "backend/app/api/v1/endpoints/executions.py" in findings[0].detail


def test_discovered_backend_guard_missing_from_contract_fails() -> None:
    validator = _load_validator()

    findings = validator._validate_discovered_authz_paths(
        set(),
        [],
        [
            validator.DiscoveredAuthzPath(
                Path("backend/app/api/v1/endpoints/example.py"),
                "backend_endpoint_guard",
                "require_permission",
            )
        ],
        {},
    )

    assert [finding.reason for finding in findings] == [
        "discovered_authz_path_not_contractual",
        "discovered_authz_path_not_sensitive",
    ]
    assert "backend/app/api/v1/endpoints/example.py" in findings[0].detail


def test_discovered_authz_paths_require_contract_and_sensitive_coverage() -> None:
    validator = _load_validator()
    path = Path("backend/app/api/v1/endpoints/example.py")
    discoveries = [
        validator.DiscoveredAuthzPath(
            path,
            "backend_endpoint_guard",
            "require_permission",
        )
    ]

    sensitive_only = validator._validate_discovered_authz_paths(set(), [path.as_posix()], discoveries, {})
    contract_only = validator._validate_discovered_authz_paths({path}, [], discoveries, {})
    both = validator._validate_discovered_authz_paths({path}, [path.as_posix()], discoveries, {})

    assert [finding.reason for finding in sensitive_only] == ["discovered_authz_path_not_contractual"]
    assert [finding.reason for finding in contract_only] == ["discovered_authz_path_not_sensitive"]
    assert both == []


def test_backend_discovery_matches_endpoint_local_require_guards() -> None:
    validator = _load_validator()

    assert validator.BACKEND_ENDPOINT_AUTHZ_PATTERN.search("_require_directory_admin")
    assert validator.BACKEND_ENDPOINT_AUTHZ_PATTERN.search("_require_custom_admin")


def test_doc_touch_gate_flags_directory_endpoint_changes() -> None:
    validator = _load_validator()
    manifest = json.loads(CONTRACT_JSON_PATH.read_text(encoding="utf-8"))

    findings = validator._validate_doc_touch(
        [Path("backend/app/api/v1/endpoints/directory.py")],
        manifest["sensitive_change_paths"],
    )

    assert [finding.reason for finding in findings] == ["authz_contract_not_updated"]
    assert "backend/app/api/v1/endpoints/directory.py" in findings[0].detail


def test_directory_admin_lifecycle_contract_is_split_from_users_directory() -> None:
    manifest = json.loads(CONTRACT_JSON_PATH.read_text(encoding="utf-8"))
    markdown = CONTRACT_MD_PATH.read_text(encoding="utf-8")
    actions = {action["id"]: action for action in manifest["actions"]}

    assert "AUTHZ-DIRECTORY-ADMIN-LIFECYCLE" in actions
    assert "AUTHZ-DIRECTORY-ADMIN-LIFECYCLE" in markdown
    assert "backend/app/api/v1/endpoints/directory.py" not in actions["AUTHZ-USERS-DIRECTORY"]["backend_authority"]
    assert "_require_directory_admin" not in actions["AUTHZ-USERS-DIRECTORY"]["backend_authority"]
    admin_lifecycle_authority = actions["AUTHZ-DIRECTORY-ADMIN-LIFECYCLE"]["backend_authority"]
    assert "backend/app/api/v1/endpoints/directory.py" in admin_lifecycle_authority
    assert "_require_directory_admin" in admin_lifecycle_authority


def test_doc_touch_gate_flags_directory_lifecycle_support_services() -> None:
    validator = _load_validator()
    manifest = json.loads(CONTRACT_JSON_PATH.read_text(encoding="utf-8"))

    for path in (
        Path("backend/app/services/directory_identity_service.py"),
        Path("backend/app/services/ad_deprovision_service.py"),
        Path("backend/app/services/access_user_service.py"),
        Path("backend/app/services/directory_provider_service.py"),
        Path("backend/app/services/graph_directory_service.py"),
    ):
        findings = validator._validate_doc_touch([path], manifest["sensitive_change_paths"])

        assert [finding.reason for finding in findings] == ["authz_contract_not_updated"]
        assert path.as_posix() in findings[0].detail


def test_discovered_frontend_gate_missing_from_contract_fails() -> None:
    validator = _load_validator()

    findings = validator._validate_discovered_authz_paths(
        set(),
        [],
        [
            validator.DiscoveredAuthzPath(
                Path("frontend/src/pages/ExamplePage.tsx"),
                "frontend_gate_surface",
                "PermissionGate",
            )
        ],
        {},
    )

    assert [finding.reason for finding in findings] == [
        "discovered_authz_path_not_contractual",
        "discovered_authz_path_not_sensitive",
    ]
    assert "frontend/src/pages/ExamplePage.tsx" in findings[0].detail


def test_discovered_allowlisted_support_path_does_not_fail() -> None:
    validator = _load_validator()

    findings = validator._validate_discovered_authz_paths(
        set(),
        [],
        [
            validator.DiscoveredAuthzPath(
                Path("frontend/src/hooks/useUsersPageFilters.ts"),
                "frontend_gate_surface",
                "hasPermission",
            )
        ],
        {
            "frontend/src/hooks/useUsersPageFilters.ts": (
                "Permission string filtering helper, not an authorization gate."
            )
        },
    )

    assert findings == []


def test_changed_frontend_local_action_gate_must_be_classified() -> None:
    validator = _load_validator()
    path = Path("frontend/src/pages/ExampleActionPage.tsx")

    findings = validator._validate_frontend_local_gate_classifications(
        [path],
        {
            path: "\n".join(
                [
                    "diff --git a/frontend/src/pages/ExampleActionPage.tsx b/frontend/src/pages/ExampleActionPage.tsx",
                    "@@ -0,0 +1 @@",
                    "+const canArchive = hasPermission('risks', 'delete');",
                ]
            )
        },
    )

    assert [finding.reason for finding in findings] == ["frontend_local_gate_not_classified"]
    assert path.as_posix() in findings[0].detail


def test_changed_frontend_route_gate_classification_passes() -> None:
    validator = _load_validator()
    path = Path("frontend/src/components/layout/Sidebar.tsx")

    findings = validator._validate_frontend_local_gate_classifications(
        [path],
        {
            path: "\n".join(
                [
                    (
                        "diff --git a/frontend/src/components/layout/Sidebar.tsx "
                        "b/frontend/src/components/layout/Sidebar.tsx"
                    ),
                    "@@ -0,0 +1 @@",
                    "+const { hasPermission } = usePermissions();",
                ]
            )
        },
    )

    assert findings == []


def test_classified_frontend_action_gate_outside_allowed_patterns_fails() -> None:
    validator = _load_validator()
    path = Path("frontend/src/pages/DashboardPage.tsx")

    findings = validator._validate_frontend_local_gate_classifications(
        [path],
        {
            path: "\n".join(
                [
                    "diff --git a/frontend/src/pages/DashboardPage.tsx b/frontend/src/pages/DashboardPage.tsx",
                    "@@ -0,0 +1 @@",
                    "+const canDeleteRisk = hasPermission('risks', 'delete');",
                ]
            )
        },
    )

    assert [finding.reason for finding in findings] == ["frontend_local_gate_not_allowed"]
    assert "hasPermission('risks', 'delete')" in findings[0].detail


def test_classified_frontend_allowed_local_gate_pattern_passes() -> None:
    validator = _load_validator()
    path = Path("frontend/src/pages/DashboardPage.tsx")

    findings = validator._validate_frontend_local_gate_classifications(
        [path],
        {
            path: "\n".join(
                [
                    "diff --git a/frontend/src/pages/DashboardPage.tsx b/frontend/src/pages/DashboardPage.tsx",
                    "@@ -0,0 +1 @@",
                    "+const canReadIssues = hasPermission('issues', 'read');",
                ]
            )
        },
    )

    assert findings == []


def test_frontend_local_gate_deletions_do_not_require_classification() -> None:
    validator = _load_validator()
    path = Path("frontend/src/pages/RemovedActionGate.tsx")

    findings = validator._validate_frontend_local_gate_classifications(
        [path],
        {
            path: "\n".join(
                [
                    "diff --git a/frontend/src/pages/RemovedActionGate.tsx b/frontend/src/pages/RemovedActionGate.tsx",
                    "@@ -1,1 +0,0 @@",
                    "-const canDeleteRisk = hasPermission('risks', 'delete');",
                ]
            )
        },
    )

    assert findings == []


def test_untracked_frontend_local_gate_source_must_be_classified(tmp_path, monkeypatch) -> None:
    validator = _load_validator()
    path = Path("frontend/src/pages/UntrackedActionPage.tsx")
    source_path = tmp_path / path
    source_path.parent.mkdir(parents=True)
    source_path.write_text("const canDelete = hasPermission('risks', 'delete');\n", encoding="utf-8")
    monkeypatch.setattr(validator, "REPO_ROOT", tmp_path)

    findings = validator._validate_frontend_local_gate_classifications([path], {})

    assert [finding.reason for finding in findings] == ["frontend_local_gate_not_classified"]


def test_cli_accepts_ignored_positional_filenames(monkeypatch) -> None:
    validator = _load_validator()
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "validate_authz_capability_contract.py",
            "--skip-doc-touch",
            "backend/app/core/security.py",
        ],
    )

    assert validator.main() == 0


def test_doc_touch_gate_flags_sensitive_changes_without_contract_update() -> None:
    validator = _load_validator()

    findings = validator._validate_doc_touch(
        [Path("backend/app/core/security.py")],
        ["backend/app/core/security.py"],
    )

    assert [finding.reason for finding in findings] == ["authz_contract_not_updated"]


def test_doc_touch_gate_requires_both_contract_artifacts_for_sensitive_changes() -> None:
    validator = _load_validator()
    sensitive_path = Path("backend/app/core/security.py")

    markdown_only = validator._validate_doc_touch(
        [
            sensitive_path,
            Path("docs/security/authorization-capability-contract.md"),
        ],
        ["backend/app/core/security.py"],
    )
    json_only = validator._validate_doc_touch(
        [
            sensitive_path,
            Path("docs/security/authorization-capability-contract.json"),
        ],
        ["backend/app/core/security.py"],
    )
    both = validator._validate_doc_touch(
        [
            sensitive_path,
            Path("docs/security/authorization-capability-contract.md"),
            Path("docs/security/authorization-capability-contract.json"),
        ],
        ["backend/app/core/security.py"],
    )

    assert [finding.reason for finding in markdown_only] == ["authz_contract_not_updated"]
    assert "authorization-capability-contract.json" in markdown_only[0].detail
    assert [finding.reason for finding in json_only] == ["authz_contract_not_updated"]
    assert "authorization-capability-contract.md" in json_only[0].detail
    assert both == []


def test_doc_touch_gate_flags_rbac_seed_contract_changes() -> None:
    validator = _load_validator()

    findings = validator._validate_doc_touch(
        [Path("backend/app/db/rbac_seed_contract.py")],
        ["backend/app/db/rbac_seed_contract.py"],
    )

    assert [finding.reason for finding in findings] == ["authz_contract_not_updated"]


def test_doc_touch_gate_flags_auth_session_authority_changes() -> None:
    validator = _load_validator()

    findings = validator._validate_doc_touch(
        [Path("backend/app/services/sso_token_service.py")],
        ["backend/app/services/sso_token_service.py"],
    )

    assert [finding.reason for finding in findings] == ["authz_contract_not_updated"]


def test_doc_touch_gate_treats_exact_frontend_manifest_files_as_sensitive() -> None:
    validator = _load_validator()

    findings = validator._validate_doc_touch(
        [Path("frontend/src/services/accessApi.ts")],
        ["frontend/src/services/accessApi.ts"],
    )

    assert [finding.reason for finding in findings] == ["authz_contract_not_updated"]


def test_doc_touch_gate_flags_frontend_authz_removals_from_diff() -> None:
    validator = _load_validator()
    path = Path("frontend/src/pages/ExamplePage.tsx")

    findings = validator._validate_doc_touch(
        [path],
        ["frontend/src/pages/"],
        {
            path: "\n".join(
                [
                    "diff --git a/frontend/src/pages/ExamplePage.tsx b/frontend/src/pages/ExamplePage.tsx",
                    "@@ -1 +0,0 @@",
                    "-const canEdit = useAuthz().canWriteRisks;",
                ]
            )
        },
    )

    assert [finding.reason for finding in findings] == ["authz_contract_not_updated"]


def test_doc_touch_gate_flags_frontend_authz_additions_from_diff() -> None:
    validator = _load_validator()
    path = Path("frontend/src/pages/ExamplePage.tsx")

    findings = validator._validate_doc_touch(
        [path],
        ["frontend/src/pages/"],
        {
            path: "\n".join(
                [
                    "diff --git a/frontend/src/pages/ExamplePage.tsx b/frontend/src/pages/ExamplePage.tsx",
                    "@@ -0,0 +1 @@",
                    "+const canEdit = useAuthz().canWriteRisks;",
                ]
            )
        },
    )

    assert [finding.reason for finding in findings] == ["authz_contract_not_updated"]


def test_doc_touch_gate_ignores_broad_frontend_directory_without_authz_tokens() -> None:
    validator = _load_validator()
    path = Path("frontend/src/pages/ExamplePage.tsx")

    findings = validator._validate_doc_touch(
        [path],
        ["frontend/src/pages/"],
        {
            path: "\n".join(
                [
                    "diff --git a/frontend/src/pages/ExamplePage.tsx b/frontend/src/pages/ExamplePage.tsx",
                    "@@ -1 +1 @@",
                    "-const label = 'Before';",
                    "+const label = 'After';",
                ]
            )
        },
    )

    assert findings == []


def test_doc_touch_gate_treats_broad_frontend_without_diff_as_sensitive() -> None:
    validator = _load_validator()
    path = Path("frontend/src/pages/ExamplePage.tsx")

    findings = validator._validate_doc_touch(
        [path],
        ["frontend/src/pages/"],
    )

    assert [finding.reason for finding in findings] == ["authz_contract_not_updated"]


def test_doc_touch_gate_passes_when_both_contract_artifacts_are_updated() -> None:
    validator = _load_validator()

    findings = validator._validate_doc_touch(
        [
            Path("backend/app/core/security.py"),
            Path("docs/security/authorization-capability-contract.md"),
            Path("docs/security/authorization-capability-contract.json"),
        ],
        ["backend/app/core/security.py"],
    )

    assert findings == []


def test_hook_and_ci_wiring_preserve_contract_gate_inputs() -> None:
    precommit = (REPO_ROOT / ".pre-commit-config.yaml").read_text(encoding="utf-8")
    makefile = (REPO_ROOT / "scripts/Makefile").read_text(encoding="utf-8")
    workflow = (REPO_ROOT / ".github/workflows/lint.yml").read_text(encoding="utf-8")

    assert "id: authz-capability-contract" in precommit
    assert "pass_filenames: false" in precommit
    assert "AUTHZ_CONTRACT_BASE_REF ?= HEAD" in makefile
    assert '--base-ref "$(AUTHZ_CONTRACT_BASE_REF)"' in makefile
    assert 'AUTHZ_CONTRACT_BASE_REF="origin/${{ github.base_ref }}"' in workflow
    assert 'github.event.before' in workflow
    assert '0000000000000000000000000000000000000000' in workflow
    assert 'AUTHZ_CONTRACT_BASE_REF="$AUTHZ_CONTRACT_BASE_REF" make' in workflow
