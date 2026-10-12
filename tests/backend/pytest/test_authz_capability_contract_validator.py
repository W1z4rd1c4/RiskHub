from __future__ import annotations

import importlib
import importlib.util
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
VALIDATOR_PATH = REPO_ROOT / "scripts/security/validate_authz_capability_contract.py"
AUTHZ_CONTRACT_MANIFEST_PATH = REPO_ROOT / "scripts/security/authz_contract_manifest.py"
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


def _load_authz_contract_manifest():
    spec = importlib.util.spec_from_file_location(
        "authz_contract_manifest",
        AUTHZ_CONTRACT_MANIFEST_PATH,
    )
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_authz_contract_manifest_exports_local_gate_policy_data() -> None:
    manifest = _load_authz_contract_manifest()

    assert (
        "frontend/src/authz/policy.ts" in manifest.FRONTEND_LOCAL_GATE_CLASSIFICATIONS
    )
    assert "risk-hub" in manifest.BUSINESS_ROUTE_NAV_EXPECTATIONS
    for classification in manifest.FRONTEND_LOCAL_GATE_CLASSIFICATIONS.values():
        assert classification["reason"]
        assert classification["allowed_patterns"]


def test_authz_validator_deep_modules_are_importable_and_script_compatible() -> None:
    validator_dir = VALIDATOR_PATH.parent
    if str(validator_dir) not in sys.path:
        sys.path.insert(0, str(validator_dir))

    models = importlib.import_module("authz_contract_validator.models")
    catalog = importlib.import_module("authz_contract_validator.capability_catalog")
    frontend_routes = importlib.import_module(
        "authz_contract_validator.frontend_routes"
    )
    importlib.import_module("authz_contract_validator.git_inputs")
    importlib.import_module("authz_contract_validator.contract_manifest")
    importlib.import_module("authz_contract_validator.markdown_validation")
    importlib.import_module("authz_contract_validator.frontend_local_gates")
    importlib.import_module("authz_contract_validator.discovery")
    runner = importlib.import_module("authz_contract_validator.runner")
    cli = importlib.import_module("authz_contract_validator.cli")
    validator = _load_validator()
    validator_source = VALIDATOR_PATH.read_text(encoding="utf-8")

    assert validator.Finding is models.Finding
    assert validator.ContractPathReference is models.ContractPathReference
    assert validator.DiscoveredAuthzPath is models.DiscoveredAuthzPath
    assert validator._validate_capability_catalog is catalog.validate_capability_catalog
    assert (
        validator._validate_business_route_nav_context
        is frontend_routes.validate_business_route_nav_context
    )
    assert callable(runner.run_validation)
    assert callable(cli.run_cli)
    assert "authz_runner.run_validation" in validator_source
    assert "authz_cli.run_cli" in validator_source


def test_authz_validator_script_is_cli_adapter() -> None:
    validator_dir = VALIDATOR_PATH.parent
    if str(validator_dir) not in sys.path:
        sys.path.insert(0, str(validator_dir))

    validator_source = VALIDATOR_PATH.read_text(encoding="utf-8")

    for implementation_detail in (
        "FRONTEND_AUTHZ_TOKEN_PATTERN",
        "BACKEND_ENDPOINT_AUTHZ_PATTERN",
        "def _extract_contract_matrix_rows",
        "def _validate_manifest",
        "def _discover_authz_paths",
    ):
        assert implementation_detail not in validator_source

    module_expectations = {
        "authz_contract_validator.contract_manifest": (
            "extract_contract_path_references",
            "validate_manifest",
            "validate_doc_touch",
        ),
        "authz_contract_validator.markdown_validation": (
            "extract_contract_matrix_rows",
            "validate_markdown",
        ),
        "authz_contract_validator.discovery": (
            "discover_authz_paths",
            "validate_discovered_authz_paths",
        ),
        "authz_contract_validator.frontend_local_gates": (
            "validate_frontend_local_gate_classifications",
        ),
    }
    for module_name, function_names in module_expectations.items():
        module = importlib.import_module(module_name)
        for function_name in function_names:
            assert callable(getattr(module, function_name))


def test_authorization_capability_contract_is_valid() -> None:
    validator = _load_validator()

    assert validator.validate("HEAD", skip_doc_touch=True) == []


def test_directory_admin_lifecycle_contract_is_split_from_users_directory() -> None:
    manifest = json.loads(CONTRACT_JSON_PATH.read_text(encoding="utf-8"))
    markdown = CONTRACT_MD_PATH.read_text(encoding="utf-8")
    actions = {action["id"]: action for action in manifest["actions"]}

    assert "AUTHZ-DIRECTORY-ADMIN-LIFECYCLE" in actions
    assert "AUTHZ-DIRECTORY-ADMIN-LIFECYCLE" in markdown
    assert (
        "backend/app/api/v1/endpoints/directory.py"
        not in actions["AUTHZ-USERS-DIRECTORY"]["backend_authority"]
    )
    assert (
        "_require_directory_admin"
        not in actions["AUTHZ-USERS-DIRECTORY"]["backend_authority"]
    )
    admin_lifecycle_authority = actions["AUTHZ-DIRECTORY-ADMIN-LIFECYCLE"][
        "backend_authority"
    ]
    assert "backend/app/api/v1/endpoints/directory.py" in admin_lifecycle_authority
    assert "_require_directory_admin" in admin_lifecycle_authority


def test_doc_touch_gate_treats_broad_frontend_without_diff_as_sensitive() -> None:
    validator = _load_validator()
    path = Path("frontend/src/pages/ExamplePage.tsx")

    findings = validator._validate_doc_touch(
        [path],
        ["frontend/src/pages/"],
    )

    assert [finding.reason for finding in findings] == ["authz_contract_not_updated"]


def test_hook_and_ci_wiring_preserve_contract_gate_inputs() -> None:
    precommit = (REPO_ROOT / ".pre-commit-config.yaml").read_text(encoding="utf-8")
    makefile = (REPO_ROOT / "scripts/Makefile").read_text(encoding="utf-8")
    workflow = (REPO_ROOT / ".github/workflows/lint.yml").read_text(encoding="utf-8")

    assert "id: authz-capability-contract" in precommit
    assert "pass_filenames: false" in precommit
    assert "AUTHZ_CONTRACT_BASE_REF ?= HEAD" in makefile
    assert '--base-ref "$(AUTHZ_CONTRACT_BASE_REF)"' in makefile
    assert 'AUTHZ_CONTRACT_BASE_REF="origin/${{ github.base_ref }}"' in workflow
    assert "github.event.before" in workflow
    assert "0000000000000000000000000000000000000000" in workflow
    assert 'AUTHZ_CONTRACT_BASE_REF="$AUTHZ_CONTRACT_BASE_REF" make' in workflow


# These are reviewed sensitivity registrations, not copied capability field sets.
# Directory registration may intentionally cover a leaf without a redundant entry.
SENSITIVE_AUTHORITY_PATHS = (
    "backend/app/core/security.py",
    "backend/app/api/v1/endpoints/directory.py",
    "backend/app/services/_directory_identity/identity.py",
    "backend/app/services/ad_deprovision_service.py",
    "backend/app/services/directory_provider_service.py",
    "backend/app/services/_graph_directory/client.py",
    "backend/app/db/rbac_seed_contract.py",
    "backend/app/services/sso_token_service.py",
    "frontend/src/services/accessApi.ts",
)


def _assert_registered_sensitive_path(path, prefixes):
    assert any(Path(path).is_relative_to(Path(prefix)) for prefix in prefixes), path


def test_production_authority_sensitivity_registrations_remain_covered():
    manifest = json.loads(CONTRACT_JSON_PATH.read_text())
    for path in SENSITIVE_AUTHORITY_PATHS:
        _assert_registered_sensitive_path(path, manifest["sensitive_change_paths"])


def test_sensitive_registration_omission_mutants_are_detected():
    import pytest

    prefixes = json.loads(CONTRACT_JSON_PATH.read_text())["sensitive_change_paths"]
    for path in SENSITIVE_AUTHORITY_PATHS:
        without_coverage = [
            prefix for prefix in prefixes if not Path(path).is_relative_to(Path(prefix))
        ]
        with pytest.raises(AssertionError, match=path.replace(".", r"\.")):
            _assert_registered_sensitive_path(path, without_coverage)
    # A similarly named sibling is not directory coverage.
    with pytest.raises(AssertionError):
        _assert_registered_sensitive_path(
            "backend/app/services/sso_token_service.py",
            ["backend/app/services/sso_token"],
        )
    _assert_registered_sensitive_path(
        "backend/app/services/_graph_directory/client.py",
        ["backend/app/services/_graph_directory/"],
    )
