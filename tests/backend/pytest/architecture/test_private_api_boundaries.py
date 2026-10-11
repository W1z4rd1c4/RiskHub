from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

ROOT = Path(__file__).resolve().parents[4]


def _existing_locks():
    path = ROOT / "tests/backend/pytest/test_architecture_deepening_contracts.py"
    spec = importlib.util.spec_from_file_location("pilot_existing_deepening", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    ("test_name", "caller", "violation"),
    [
        (
            "test_risk_questionnaire_routes_use_lifecycle_interface",
            "app.api.v1.endpoints.risk_questionnaires.questionnaire",
            "from app.services.risk_questionnaire_service import "
            "open_questionnaire_for_user as bypass\nbypass(None)\n",
        ),
        (
            "test_risk_questionnaire_routes_use_lifecycle_interface",
            "app.api.v1.endpoints.risk_questionnaires.questionnaire",
            "import app.services.risk_questionnaire_service as escaped\n"
            "operation = escaped.open_questionnaire_for_user\noperation(None)\n",
        ),
        (
            "test_control_execution_and_link_routes_use_governance_interface",
            "app.api.v1.endpoints.executions",
            "from app.services._control_execution import "
            "linked_risk_names_for_visible_ids as bypass\nbypass(None)\n",
        ),
    ],
)
def test_existing_endpoint_locks_reject_aliased_low_level_access(
    monkeypatch: pytest.MonkeyPatch, test_name: str, caller: str, violation: str
) -> None:
    locks = _existing_locks()
    original_getsource = locks.inspect.getsource

    def mutated_source(value):
        source = original_getsource(value)
        if getattr(value, "__name__", None) == caller:
            return source + "\n" + violation
        return source

    monkeypatch.setattr(locks.inspect, "getsource", mutated_source)
    with pytest.raises(AssertionError, match="private API"):
        getattr(locks, test_name)()


@pytest.mark.parametrize(
    "source",
    [
        "import app.api.v1.endpoints as web",
        "from app.api.v1.endpoints import users as web",
        "from ..api.v1 import endpoints as web",
        "import app.api as web\nhandler = web.v1.endpoints.users",
        "from importlib import import_module as load\nload('app.api.v1.endpoints.users')",
        "def broken(:",
    ],
)
def test_service_inversion_rejects_real_dependencies(source: str) -> None:
    from tests.backend.pytest.architecture._private_api_boundary import endpoint_dependency_violations

    assert endpoint_dependency_violations(source, "app.services.example")


def test_service_inversion_allows_caller_metadata_strings() -> None:
    from tests.backend.pytest.architecture._private_api_boundary import endpoint_dependency_violations

    source = "CALLER_ROLES = {'app.api.v1.endpoints.example': 'query_adapter'}"
    assert endpoint_dependency_violations(source, "app.services.example") == []


@pytest.mark.parametrize(
    "source",
    [
        "from app.services._risk_questionnaires import missing",
        "from app.services._risk_questionnaires.policy import can_send_questionnaire",
        "from app.services._risk_questionnaires import open_questionnaire_for_user as operation",
        "import app.services._risk_questionnaires as api\napi.open_questionnaire_for_user(None)",
        "from ...services import _risk_questionnaires as api\napi.open_questionnaire_for_user(None)",
        "from app.services._risk_questionnaires import *",
        "import app.services._risk_questionnaires as api\ngetattr(api, 'read_questionnaire_detail')",
        "from importlib import import_module as load\nload('app.services._risk_questionnaires')",
        "import app.services._risk_questionnaires as api\nconsume(api)",
        "import app.services._risk_questionnaires as api\nif flag:\n api = unrelated\n"
        "api.open_questionnaire_for_user(None)",
    ],
)
def test_new_endpoint_cannot_escape_restrictive_default(source: str) -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    assert violations(source, "app.api.endpoints.renamed", load_surfaces(ROOT))


@pytest.mark.parametrize(
    "source",
    [
        "from app.services._risk_questionnaires import read_questionnaire_detail as operation\noperation(None)",
        "import app.services._risk_questionnaires as api\napi.read_questionnaire_detail(None)",
    ],
)
def test_new_endpoint_may_use_declared_lifecycle_surface(source: str) -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    assert violations(source, "app.api.endpoints.renamed", load_surfaces(ROOT)) == []


def test_exports_resolve_without_implementation_location_pins() -> None:
    from importlib import import_module

    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces

    for surface in load_surfaces(ROOT):
        package = import_module(surface.package)
        assert package.__all__ == list(surface.exports)
        for name in surface.exports:
            assert getattr(package, name) is not None
        for facade_name in surface.facades:
            facade = import_module(facade_name)
            assert facade.__all__ == package.__all__
            for name in surface.exports:
                assert getattr(facade, name) is getattr(package, name)


def test_function_resolves_later_module_boundary_import() -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    source = "def call():\n q.open_questionnaire_for_user()\nimport app.services._risk_questionnaires as q\ncall()"
    assert violations(source, "app.api.endpoints.new", load_surfaces(ROOT))


@pytest.mark.parametrize(
    "argument", ["'app.services._risk_questionnaires'", "package='app.services._risk_questionnaires'"]
)
def test_relative_dynamic_import_uses_supplied_package(argument: str) -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    source = "from importlib import import_module\nmodule = import_module('.workflow', " + argument + ")"
    assert violations(source, "app.api.endpoints.new", load_surfaces(ROOT))


def test_internal_module_move_preserves_real_http_journey(tmp_path: Path) -> None:
    """Move implementation only; execute the existing authorized/denied HTTP callers unchanged."""
    import os
    import shutil
    import subprocess
    import sys

    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces

    sandbox = tmp_path / "repo"
    shutil.copytree(ROOT / "backend/app", sandbox / "backend/app", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(
        ROOT / "tests", sandbox / "tests", ignore=shutil.ignore_patterns("__pycache__", "results", "node_modules")
    )
    shutil.copy2(ROOT / "backend/pytest.ini", sandbox / "backend/pytest.ini")
    owner = sandbox / "backend/app/services/_risk_questionnaires"
    original = owner / "lifecycle.py"
    moved = owner / "relocated_operations.py"
    original_bytes = original.read_bytes()
    original.rename(moved)
    wiring = owner / "__init__.py"
    source = wiring.read_text()
    assert "from .lifecycle import " in source
    wiring.write_text(source.replace("from .lifecycle import ", "from .relocated_operations import "))
    assert moved.read_bytes() == original_bytes
    assert not original.exists()
    assert load_surfaces(sandbox) == load_surfaces(ROOT)
    journey = "tests/backend/pytest/api/v1/test_risk_questionnaires.py"
    assert (sandbox / journey).read_bytes() == (ROOT / journey).read_bytes()
    environment = os.environ.copy()
    environment.update(
        {
            "PYTHONPATH": str(sandbox / "backend") + os.pathsep + str(sandbox),
            "TEST_DATABASE_URL": "sqlite+aiosqlite:///:memory:",
            "DATABASE_URL": "sqlite+aiosqlite:///:memory:",
        }
    )
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "--config-file",
            "pytest.ini",
            "--no-cov",
            "-q",
            "../" + journey + "::test_open_questionnaire_transitions_for_eligible_user_and_is_idempotent",
            "../" + journey + "::test_open_questionnaire_forbidden_for_ineligible_user",
        ],
        cwd=sandbox / "backend",
        env=environment,
        capture_output=True,
        text=True,
        timeout=90,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "2 passed" in result.stdout


def test_all_service_and_endpoint_callers_use_declared_pilot_boundaries() -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_exceptions, load_surfaces, violations

    surfaces = load_surfaces(ROOT)
    exceptions = load_exceptions(Path(__file__).with_name("_private_api_exceptions.toml"))
    errors = []
    for folder in (ROOT / "backend/app", ROOT / "backend/scripts", ROOT / "scripts"):
        for path in sorted(folder.rglob("*.py")):
            base = ROOT / "backend" if path.is_relative_to(ROOT / "backend") else ROOT
            parts = path.relative_to(base).with_suffix("").parts
            caller = ".".join(parts[:-1] if path.name == "__init__.py" else parts)
            errors.extend(
                violations(
                    path.read_text(), caller, surfaces, is_package=path.name == "__init__.py", exceptions=exceptions
                )
            )
    assert errors == [], "\n".join(errors)


def test_exception_expiry_and_endpoint_scope_are_enforced(tmp_path: Path) -> None:
    from datetime import date

    from tests.backend.pytest.architecture._private_api_boundary import load_exceptions

    original = Path(__file__).with_name("_private_api_exceptions.toml").read_text()
    path = tmp_path / "exceptions.toml"
    path.write_text(original)
    with pytest.raises(AssertionError, match="expired"):
        load_exceptions(path, today=date(2026, 12, 6))
    path.write_text(original.replace("app.services._authorization_capabilities.risks", "app.api.endpoints.new"))
    with pytest.raises(AssertionError, match="caller exception"):
        load_exceptions(path, today=date(2026, 10, 11))


@pytest.mark.parametrize("caller", ["app.core.example", "app.jobs.worker", "scripts.local_cli"])
def test_non_service_production_callers_cannot_import_implementation(caller: str) -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    source = "from app.services._risk_questionnaires.lifecycle import read_questionnaire_detail"
    assert violations(source, caller, load_surfaces(ROOT))


def test_internal_dynamic_import_cannot_hide_cross_package_target() -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    surfaces = load_surfaces(ROOT)
    caller = "app.services._risk_questionnaires.workflow"
    assert violations("from importlib import import_module\nimport_module(name)", caller, surfaces)
    assert violations(
        "from importlib import import_module\nimport_module('.workflow', 'app.services._control_execution')",
        caller,
        surfaces,
    )
    assert (
        violations(
            "from importlib import import_module\nimport_module('.policy', 'app.services._risk_questionnaires')",
            caller,
            surfaces,
        )
        == []
    )


@pytest.mark.parametrize(
    "mutation, diagnostic",
    [
        ('"open_questionnaire_detail": ("service",),', "duplicate declaration key"),
        ('"nonexistent": ("endpoint",),', "support service callers"),
        ('"nonexistent": ("service", "service"),', "duplicate caller class"),
        ('"nonexistent": ("service", "unassigned"),', "unassigned caller class"),
    ],
)
def test_invalid_declaration_mutations_fail_closed(tmp_path: Path, mutation: str, diagnostic: str) -> None:
    import shutil

    from tests.backend.pytest.architecture._private_api_boundary import PILOT_PACKAGES, load_surfaces

    for package in PILOT_PACKAGES:
        relative = Path("backend", *package.split("."), "__init__.py")
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / relative, target)
    target = tmp_path / "backend/app/services/_risk_questionnaires/__init__.py"
    target.write_text(target.read_text().replace("CALLER_EXPORTS = {", "CALLER_EXPORTS = {\n" + mutation))
    with pytest.raises(AssertionError, match=diagnostic):
        load_surfaces(tmp_path)


def test_missing_export_binding_is_detected(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import _risk_questionnaires as package

    monkeypatch.delattr(package, "read_questionnaire_detail")
    with pytest.raises(AttributeError, match="read_questionnaire_detail"):
        test_exports_resolve_without_implementation_location_pins()


@pytest.mark.parametrize(
    "mutation",
    [
        '_EXPORTS["op"] = ("app.services._risk_questionnaires.workflow", "open_questionnaire_for_user")',
        '_EXPORTS.update({"op": ("app.services._risk_questionnaires.workflow", "open_questionnaire_for_user")})',
        'alias = _EXPORTS\nalias["op"] = ("app.services._risk_questionnaires.workflow", "open_questionnaire_for_user")',
        '_EXPORTS = {"op": ("app.services._risk_questionnaires.workflow", "open_questionnaire_for_user")}',
    ],
)
def test_mutated_dynamic_target_map_cannot_hide_private_import(mutation: str) -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    source = (
        'from importlib import import_module\n_EXPORTS = {"op": ("math", "sqrt")}\n'
        + mutation
        + '\nmodule_name, attr = _EXPORTS["op"]\n'
        "module = import_module(module_name)\nmodule.open_questionnaire_for_user(None)\n"
    )
    assert violations(source, "app.api.endpoints.new", load_surfaces(ROOT))


@pytest.mark.parametrize(
    "mutation",
    [
        'if flag:\n _EXPORTS["op"] = ("app.services._risk_questionnaires.workflow", "open_questionnaire_for_user")',
        'def change():\n _EXPORTS["op"] = ("app.services._risk_questionnaires.workflow", '
        '"open_questionnaire_for_user")\nchange()',
    ],
)
def test_later_branch_or_function_target_map_mutation_is_not_trusted(mutation: str) -> None:
    test_mutated_dynamic_target_map_cannot_hide_private_import(mutation)


def test_dynamic_target_map_function_parameter_shadow_is_not_trusted() -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    source = (
        'from importlib import import_module\n_EXPORTS = {"op": ("math", "sqrt")}\n'
        'def call(_EXPORTS):\n module_name, attr = _EXPORTS["op"]\n import_module(module_name)\n'
    )
    assert violations(source, "app.api.endpoints.new", load_surfaces(ROOT))


def test_immutable_internal_lazy_export_map_remains_supported() -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    source = (ROOT / "backend/app/services/_riskhub_config/__init__.py").read_text()
    assert violations(source, "app.services._riskhub_config", load_surfaces(ROOT), is_package=True) == []


def test_shadowed_list_cannot_smuggle_target_map_mutation() -> None:
    mutation = (
        'def list(value):\n value["op"] = ("app.services._risk_questionnaires.workflow", '
        '"open_questionnaire_for_user")\n return []\n__all__ = list(_EXPORTS)'
    )
    test_mutated_dynamic_target_map_cannot_hide_private_import(mutation)


@pytest.mark.parametrize(
    "function",
    [
        "def run(module_name):\n return import_module(module_name)",
        'def run(module_name="math"):\n return import_module(module_name)',
        "run = lambda module_name: import_module(module_name)",
    ],
)
def test_inner_parameter_does_not_inherit_outer_inferred_import_target(function: str) -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    source = (
        'from importlib import import_module\n_EXPORTS = {"op": ("math", "sqrt")}\n'
        'module_name, attr = _EXPORTS["op"]\n' + function + '\nrun("app.services._risk_questionnaires.workflow")\n'
    )
    assert violations(source, "app.api.endpoints.new", load_surfaces(ROOT))


@pytest.mark.parametrize(
    "mutation",
    [
        'module_name: str = "app.services._risk_questionnaires.workflow"',
        'module_name += ".unexpected"',
        'for module_name in ["app.services._risk_questionnaires.workflow"]:\n pass',
        '(module_name := "app.services._risk_questionnaires.workflow")',
        'module_name, attr = external_targets["op"]',
    ],
)
def test_unsupported_target_rebinding_invalidates_finite_inference(mutation: str) -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    source = (
        'from importlib import import_module\n_EXPORTS = {"op": ("math", "sqrt")}\n'
        'module_name, attr = _EXPORTS["op"]\n' + mutation + "\nimport_module(module_name)\n"
    )
    assert violations(source, "app.api.endpoints.new", load_surfaces(ROOT))


def test_unexecuted_branch_cannot_replace_unknown_target_with_trusted_inference() -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    source = (
        'from importlib import import_module\n_EXPORTS = {"op": ("math", "sqrt")}\n'
        'module_name = "app.services._risk_questionnaires.workflow"\n'
        'if False:\n module_name, attr = _EXPORTS["op"]\nimport_module(module_name)\n'
    )
    assert violations(source, "app.api.endpoints.new", load_surfaces(ROOT))


@pytest.mark.parametrize(
    "binding",
    [
        "for module_name in []:\n pass",
        "match incoming:\n case module_name:\n  pass",
        "try:\n pass\nexcept Exception as module_name:\n pass",
        "from external_plugin import *",
        'def change():\n global module_name\n module_name = "app.services._risk_questionnaires.workflow"\nchange()',
    ],
)
def test_finite_target_requires_one_unconditional_unescaped_binding(binding: str) -> None:
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    source = (
        'from importlib import import_module\n_EXPORTS = {"op": ("math", "sqrt")}\n'
        'module_name, attr = _EXPORTS["op"]\n' + binding + "\nimport_module(module_name)\n"
    )
    assert violations(source, "app.api.endpoints.new", load_surfaces(ROOT))
