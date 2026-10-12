from __future__ import annotations

import hashlib
import importlib.util
import re
import subprocess
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace
from zipfile import ZipFile

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
VALIDATOR = REPO_ROOT / "scripts/tools/validate_python_dependency_lock.py"
REFRESHER = REPO_ROOT / "scripts/tools/refresh_python_dependency_lock.py"
PERMISSION_HELPER = (
    REPO_ROOT / "scripts/tools/check_github_pr_automation_permissions.py"
)
ENTRYPOINT = REPO_ROOT / "backend/requirements-dev.txt"
BACKEND_README = REPO_ROOT / "backend/README.md"
REFRESH_WORKFLOW = REPO_ROOT / ".github/workflows/python-dev-lock-refresh.yml"


def _permission_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "riskhub_permission_preflight",
        PERMISSION_HELPER,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _dependency_lock_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "riskhub_dependency_lock_validator",
        VALIDATOR,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _dependency_refresher_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("riskhub_dependency_refresher", REFRESHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_bounded_refresh_retains_every_unselected_pin(tmp_path, monkeypatch):
    module = _dependency_refresher_module()
    lock = tmp_path / "lock.txt"
    lock.write_text(
        "# generated\nruff==0.6.9\nmypy==2.3.1\n"
        "pydantic==2.13.5\npydantic_core==2.46.5\nSQLAlchemy-Utils==0.41.2\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(module, "DEV_LOCK", lock)

    assert module._retained_constraints(["RUFF", "sqlalchemy_utils"]) == (
        "mypy==2.3.1\npydantic==2.13.5\npydantic_core==2.46.5\n"
    )


@pytest.mark.parametrize("selection", [["rufff"], ["ruff>=0.16"], ["not-installed"]])
def test_bounded_refresh_rejects_unknown_selection(selection, tmp_path, monkeypatch):
    module = _dependency_refresher_module()
    lock = tmp_path / "lock.txt"
    lock.write_text("ruff==0.6.9\n", encoding="utf-8")
    monkeypatch.setattr(module, "DEV_LOCK", lock)

    with pytest.raises(ValueError, match="absent from existing lock"):
        module._retained_constraints(selection)


@pytest.mark.parametrize("invalid", ["mypy>=2", "mypy==2.*", "mypy==2; python_version > '3'", "-r other.txt"])
def test_bounded_refresh_rejects_nonexact_existing_lock(invalid, tmp_path, monkeypatch):
    module = _dependency_refresher_module()
    lock = tmp_path / "lock.txt"
    lock.write_text(f"ruff==0.6.9\n{invalid}\n", encoding="utf-8")
    monkeypatch.setattr(module, "DEV_LOCK", lock)

    with pytest.raises(ValueError, match="non-exact index pin"):
        module._retained_constraints(["ruff"])


def test_bounded_refresh_rejects_duplicate_canonical_names(tmp_path, monkeypatch):
    module = _dependency_refresher_module()
    lock = tmp_path / "lock.txt"
    lock.write_text("SQLAlchemy-Utils==0.41.2\nsqlalchemy_utils==0.42.1\n", encoding="utf-8")
    monkeypatch.setattr(module, "DEV_LOCK", lock)

    with pytest.raises(ValueError, match="duplicate package: sqlalchemy-utils"):
        module._retained_constraints(["sqlalchemy-utils"])


@pytest.mark.parametrize("resolved", ["pydantic_core==2.49.0\n", "ruff==0.16.10\n"])
def test_bounded_refresh_rejects_changed_or_missing_retained_dependency(resolved):
    module = _dependency_refresher_module()

    with pytest.raises(ValueError, match="changed or removed unselected pin: pydantic_core==2.46.5"):
        module._validate_retained_pins("pydantic_core==2.46.5\n", resolved)


def test_bounded_refresh_accepts_canonical_name_equivalence():
    module = _dependency_refresher_module()
    module._validate_retained_pins("pydantic_core==2.46.5\n", "pydantic-core==2.46.5\n")


def test_bounded_refresh_can_explicitly_select_every_existing_pin(tmp_path, monkeypatch):
    module = _dependency_refresher_module()
    lock = tmp_path / "lock.txt"
    lock.write_text("ruff==0.6.9\n", encoding="utf-8")
    monkeypatch.setattr(module, "DEV_LOCK", lock)

    retained = module._retained_constraints(["ruff"])

    assert retained == ""
    module._validate_retained_pins(retained, "ruff==0.16.10\n")


def test_bounded_generator_applies_constraints_and_checks_installed_dependencies(tmp_path, monkeypatch):
    module = _dependency_refresher_module()
    lock = tmp_path / "lock.txt"
    lock.write_text("ruff==0.6.9\npydantic_core==2.46.5\n", encoding="utf-8")
    monkeypatch.setattr(module, "DEV_LOCK", lock)
    monkeypatch.setattr(module, "sys", SimpleNamespace(executable="python3.13", version_info=(3, 13)))
    calls = []

    def run(command, *, cwd=None):
        calls.append(command)
        if "-r" in command:
            assert command[command.index("-r") + 1] == str(module.INPUT)
            retained = Path(command[command.index("-c") + 1]).read_text(encoding="utf-8")
            assert retained == "pydantic_core==2.46.5\n"

    def freeze(command, **kwargs):
        assert calls[-1][-3:] == ["-m", "pip", "check"]
        assert command[-4:] == ["-m", "pip", "freeze", "--all"]
        return subprocess.CompletedProcess(command, 0, "ruff==0.16.10\npydantic_core==2.46.5\n", "")

    monkeypatch.setattr(module, "_run", run)
    monkeypatch.setattr(module.subprocess, "run", freeze)

    result = module.generate_lock(upgrade_packages=["ruff"])

    assert result == module.LOCK_HEADER + "pydantic_core==2.46.5\nruff==0.16.10\n"
    assert calls[0][1:3] == ["-m", "venv"]


def test_bounded_generator_installs_retained_package_no_longer_reachable_from_inputs(tmp_path, monkeypatch):
    module = _dependency_refresher_module()
    wheels = tmp_path / "wheels"
    wheels.mkdir()
    for name, version in [("riskhub-selected-probe", "2.0"), ("riskhub-retained-probe", "1.0")]:
        distribution = name.replace("-", "_")
        metadata = f"{distribution}-{version}.dist-info"
        files = {
            f"{metadata}/METADATA": f"Metadata-Version: 2.1\nName: {name}\nVersion: {version}\n",
            f"{metadata}/WHEEL": "Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n",
        }
        files[f"{metadata}/RECORD"] = "".join(f"{path},,\n" for path in files) + f"{metadata}/RECORD,,\n"
        with ZipFile(wheels / f"{distribution}-{version}-py3-none-any.whl", "w") as wheel:
            for path, content in files.items():
                wheel.writestr(path, content)
    intent = tmp_path / "requirements.in"
    intent.write_text("riskhub-selected-probe==2.0\n", encoding="utf-8")
    lock = tmp_path / "lock.txt"
    lock.write_text("riskhub-selected-probe==1.0\nriskhub-retained-probe==1.0\n", encoding="utf-8")
    monkeypatch.setattr(module, "INPUT", intent)
    monkeypatch.setattr(module, "DEV_LOCK", lock)
    monkeypatch.setenv("PIP_NO_INDEX", "1")
    monkeypatch.setenv("PIP_FIND_LINKS", wheels.as_uri())
    run = module._run

    def offline_run(command, *, cwd=None):
        # Use venv's bundled pip for this offline solver fixture. The production
        # bootstrap version and command remain covered by the contract tests.
        if command[-2:] != ["--upgrade", f"pip=={module.PIP_VERSION}"]:
            run(command, cwd=cwd)

    monkeypatch.setattr(module, "_run", offline_run)

    result = module.generate_lock(upgrade_packages=["riskhub-selected-probe"])

    assert "riskhub-selected-probe==2.0\n" in result
    assert "riskhub-retained-probe==1.0\n" in result


def test_bounded_resolver_conflict_leaves_all_generated_surfaces_untouched(tmp_path, monkeypatch):
    module = _dependency_refresher_module()
    original = {}
    for attribute in ("INPUT", "DEV_LOCK", "AUDIT_LOCK", "ENTRYPOINT"):
        path = tmp_path / attribute
        path.write_bytes(f"original {attribute}\n".encode())
        monkeypatch.setattr(module, attribute, path)
        original[path] = path.read_bytes()

    def resolver_conflict(*, upgrade_packages):
        assert upgrade_packages == ["mypy"]
        raise subprocess.CalledProcessError(1, ["pip", "install"])

    monkeypatch.setattr(module, "generate_lock", resolver_conflict)
    with pytest.raises(subprocess.CalledProcessError):
        module.refresh(check=False, upgrade_packages=["mypy"])

    assert {path: path.read_bytes() for path in original} == original


@pytest.mark.parametrize("mode", ["check", "pip-check-failure"])
def test_bounded_refresh_preserves_all_output_bytes_without_successful_write(mode, tmp_path, monkeypatch):
    module = _dependency_refresher_module()
    monkeypatch.setattr(module, "REPO_ROOT", tmp_path)
    original = {}
    for attribute, content in {
        "INPUT": "ruff==0.16.10\n",
        "DEV_LOCK": "ruff==0.6.9\npydantic_core==2.46.5\n",
        "AUDIT_LOCK": "ruff==0.6.9\npydantic_core==2.46.5\n",
        "ENTRYPOINT": "original wrapper and digests\n",
    }.items():
        path = tmp_path / attribute
        path.write_bytes(content.encode())
        monkeypatch.setattr(module, attribute, path)
        original[path] = path.read_bytes()
    monkeypatch.setattr(
        module, "sys", SimpleNamespace(executable="python3.13", version_info=(3, 13), stderr=sys.stderr)
    )
    calls = []

    def run(command, *, cwd=None):
        calls.append(command)
        if "-r" in command:
            assert Path(command[command.index("-c") + 1]).read_text() == "pydantic_core==2.46.5\n"
        if command[-3:] == ["-m", "pip", "check"] and mode == "pip-check-failure":
            raise subprocess.CalledProcessError(1, command)

    def freeze(command, **kwargs):
        assert calls[-1][-3:] == ["-m", "pip", "check"]
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, "ruff==0.16.10\npydantic_core==2.46.5\n", "")

    monkeypatch.setattr(module, "_run", run)
    monkeypatch.setattr(module.subprocess, "run", freeze)

    if mode == "check":
        assert module.refresh(check=True, upgrade_packages=["ruff"]) == 1
        assert calls[-1][-4:] == ["-m", "pip", "freeze", "--all"]
    else:
        with pytest.raises(subprocess.CalledProcessError):
            module.refresh(check=False, upgrade_packages=["ruff"])
        assert calls[-1][-3:] == ["-m", "pip", "check"]
    assert {path: path.read_bytes() for path in original} == original


def _temporary_dependency_lock(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    replacements: dict[str, str],
    pytest_intent_override: str | None = None,
    syrupy_intent_override: str | None = None,
) -> ModuleType:
    module = _dependency_lock_module()
    input_path = tmp_path / "requirements-dev.in"
    lock_path = tmp_path / "requirements-dev-constraints.txt"
    audit_path = tmp_path / "requirements-prod-readiness-audit-constraints.txt"
    entrypoint_path = tmp_path / "requirements-dev.txt"

    input_content = module.INPUT.read_text(encoding="utf-8")
    if pytest_intent_override is not None:
        input_content, replacement_count = re.subn(
            r"^pytest[^-][^\n]*$",
            f"pytest{pytest_intent_override}",
            input_content,
            count=1,
            flags=re.MULTILINE,
        )
        assert replacement_count == 1
    if syrupy_intent_override is not None:
        input_content, replacement_count = re.subn(
            r"^syrupy==[^\n]+$",
            f"syrupy=={syrupy_intent_override}",
            input_content,
            count=1,
            flags=re.MULTILINE,
        )
        assert replacement_count == 1
    input_path.write_text(input_content, encoding="utf-8")
    for included_name in (
        "requirements.txt",
        "requirements-db.txt",
        "requirements-runtime.txt",
    ):
        (tmp_path / included_name).write_bytes(
            (module.BACKEND_ROOT / included_name).read_bytes()
        )
    lock_content = module.LOCK.read_text(encoding="utf-8")
    for current, replacement in replacements.items():
        assert current in lock_content
        lock_content = lock_content.replace(current, replacement)
    lock_path.write_text(lock_content, encoding="utf-8")
    audit_path.write_text(lock_content, encoding="utf-8")
    entrypoint_path.write_text(
        "# Canonical backend development/test install entrypoint.\n"
        "# Human-edited intent lives in requirements-dev.in; exact resolution is installed\n"
        "# from requirements-dev-constraints.txt for both local setup and CI.\n"
        f"# input-sha256: {hashlib.sha256(input_path.read_bytes()).hexdigest()}\n"
        f"# lock-sha256: {hashlib.sha256(lock_path.read_bytes()).hexdigest()}\n"
        "-r requirements-dev.in\n"
        "-r requirements-dev-constraints.txt\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(module, "INPUT", input_path)
    monkeypatch.setattr(module, "LOCK", lock_path)
    monkeypatch.setattr(module, "AUDIT_CONSTRAINTS", audit_path)
    monkeypatch.setattr(module, "ENTRYPOINT", entrypoint_path)
    return module


def test_backend_development_dependency_lock_contract():
    subprocess.run(
        [sys.executable, str(VALIDATOR)],
        cwd=REPO_ROOT,
        check=True,
    )


def test_dependency_lock_rejects_unsafe_pip(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    module = _temporary_dependency_lock(
        tmp_path,
        monkeypatch,
        replacements={"pip==26.2.1\n": "pip==26.1.1\n"},
    )

    assert "unsafe pip lock: pip==26.1.1 is below fixed version 26.1.2" in module.validate()


def test_dependency_lock_requires_a_pip_pin(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    module = _temporary_dependency_lock(
        tmp_path,
        monkeypatch,
        replacements={"pip==26.2.1\n": ""},
    )

    assert "unsafe pip lock: pip must be pinned at or above 26.1.2" in module.validate()


def test_dependency_lock_rejects_unsafe_pytest(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    module = _temporary_dependency_lock(
        tmp_path,
        monkeypatch,
        replacements={"pytest==9.1.1\n": "pytest==9.0.2\n"},
    )

    assert "unsafe pytest lock: pytest==9.0.2 is below fixed version 9.0.3" in module.validate()


def test_dependency_lock_rejects_refresher_pip_version_regression(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    module = _dependency_lock_module()
    mutated_refresher = tmp_path / "refresh_python_dependency_lock.py"
    content = module.REFRESH_SCRIPT.read_text(encoding="utf-8")
    mutated_content, replacement_count = re.subn(
        r'^PIP_VERSION = "[^"]+"$',
        'PIP_VERSION = "26.1.1"',
        content,
        count=1,
        flags=re.MULTILINE,
    )
    assert replacement_count == 1
    mutated_refresher.write_text(mutated_content, encoding="utf-8")
    monkeypatch.setattr(module, "REFRESH_SCRIPT", mutated_refresher)

    assert (
        "dependency lock refresher must install pip==26.2.1"
        in module.validate()
    )


@pytest.mark.parametrize("intent", ["4.6.*", "5.0.*", "6.*", "6.1.*", "6.1.0", "6.2.0"])
def test_dependency_lock_rejects_unreviewed_syrupy_intent(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    intent: str,
):
    module = _temporary_dependency_lock(
        tmp_path,
        monkeypatch,
        replacements={},
        syrupy_intent_override=intent,
    )

    assert (
        "requirements-dev.in must request syrupy==6.1.1 exactly"
        in module.validate()
    )


def test_dependency_lock_rejects_pytest_intent_regression(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    module = _temporary_dependency_lock(
        tmp_path,
        monkeypatch,
        replacements={},
        pytest_intent_override=">=8.0.0",
    )

    assert (
        "requirements-dev.in must request pytest>=9.0.3,<10 exactly"
        in module.validate()
    )


@pytest.mark.parametrize("mirror_name", ["LOCK", "AUDIT_CONSTRAINTS"])
def test_dependency_lock_rejects_pip_regression_in_either_mirror(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mirror_name: str,
):
    module = _temporary_dependency_lock(
        tmp_path,
        monkeypatch,
        replacements={},
    )
    mirror = getattr(module, mirror_name)
    content = mirror.read_text(encoding="utf-8")
    assert "pip==26.2.1\n" in content
    mirror.write_text(
        content.replace("pip==26.2.1\n", "pip==26.1.1\n"),
        encoding="utf-8",
    )

    assert (
        "development and production-readiness audit locks must be exact mirrors"
        in module.validate()
    )


def test_backend_dependency_lock_refresh_command_is_documented_and_runnable():
    result = subprocess.run(
        [sys.executable, str(REFRESHER), "--help"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )

    assert "Regenerate RiskHub's exact Python 3.13" in result.stdout


def test_backend_dependency_entrypoint_has_generated_terminal_newline():
    content = ENTRYPOINT.read_bytes()
    assert content.endswith(b"\n")
    assert not content.endswith(b"\n\n")


def test_backend_lock_refresh_uses_one_approved_permission_preflight():
    workflow = REFRESH_WORKFLOW.read_text(encoding="utf-8")
    permission_command = (
        "python3 scripts/tools/check_github_pr_automation_permissions.py"
    )
    refresh_command = "python3 scripts/tools/refresh_python_dependency_lock.py"

    assert "RISKHUB_AUTOMATION_PR_TOKEN" in workflow
    assert "secrets.GITHUB_TOKEN" not in workflow
    assert "persist-credentials: false" in workflow
    assert "if: github.ref == 'refs/heads/main'" in workflow
    assert workflow.count(permission_command) == 1
    assert workflow.index(permission_command) < workflow.index(refresh_command)
    assert "expect_validation_error" not in workflow
    assert "__riskhub_permission_probe_missing__" not in workflow


def test_permission_preflight_rejects_token_without_contents_write(monkeypatch):
    module = _permission_module()
    context = module.GitHubContext("owner/repo", "token", "42")
    monkeypatch.setattr(
        module,
        "_request",
        lambda *_args, **_kwargs: (
            200,
            {"permissions": {"push": False}, "default_branch": "main"},
        ),
    )

    with pytest.raises(RuntimeError, match="Contents write"):
        module._require_repository_push(context)


def test_permission_preflight_executes_authenticated_push_dry_run(monkeypatch):
    module = _permission_module()
    context = module.GitHubContext("owner/repo", "token", "42")
    calls: list[list[str]] = []

    def fake_run(command: list[str]):
        calls.append(command)
        if command[:3] == ["git", "push", "--dry-run"]:
            return subprocess.CompletedProcess(command, 1, "", "denied")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr(module, "_run_command", fake_run)

    with pytest.raises(RuntimeError, match="cannot push"):
        module._require_git_push_dry_run(context)

    assert calls[0] == ["gh", "auth", "setup-git"]
    assert calls[1][:3] == ["git", "push", "--dry-run"]
    assert calls[1][-1].endswith("automation/permission-probe-42")


def test_permission_preflight_uses_non_mutating_pr_validation_payload(monkeypatch):
    module = _permission_module()
    context = module.GitHubContext("owner/repo", "token", "42")
    captured: dict[str, object] = {}

    def fake_request(_context, path, *, method="GET", payload=None):
        captured.update(path=path, method=method, payload=payload)
        return 422, {"message": "Validation Failed"}

    monkeypatch.setattr(module, "_request", fake_request)
    module._require_pull_request_endpoint(context)

    assert captured == {
        "path": "/repos/owner/repo/pulls",
        "method": "POST",
        "payload": {},
    }


def test_permission_preflight_sends_json_content_type(monkeypatch):
    module = _permission_module()
    context = module.GitHubContext("owner/repo", "token", "42")
    captured: dict[str, object] = {}

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b"{}"

    def fake_urlopen(request, *, timeout):
        captured["content_type"] = request.headers.get("Content-type")
        captured["data"] = request.data
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(module.urllib.request, "urlopen", fake_urlopen)
    status, body = module._request(
        context,
        "/repos/owner/repo/pulls",
        method="POST",
        payload={},
    )

    assert (status, body) == (200, {})
    assert captured == {
        "content_type": "application/json",
        "data": b"{}",
        "timeout": 30,
    }


def test_permission_preflight_rejects_missing_pull_request_write(monkeypatch):
    module = _permission_module()
    context = module.GitHubContext("owner/repo", "token", "42")
    monkeypatch.setattr(
        module,
        "_request",
        lambda *_args, **_kwargs: (403, {"message": "Resource not accessible"}),
    )

    with pytest.raises(RuntimeError, match="pull-request write endpoint"):
        module._require_pull_request_endpoint(context)


def test_backend_readme_describes_the_executed_permission_preflight():
    readme = " ".join(BACKEND_README.read_text(encoding="utf-8").split())

    for required in (
        "check_github_pr_automation_permissions.py",
        "permissions.push=true",
        "git push --dry-run",
        "empty JSON object",
        "HTTP 401, 403, or 404",
        "land the reviewed workflow on `main`",
    ):
        assert required in readme

    for stale in (
        "intentionally nonexistent object",
        "intentionally nonexistent head",
        "two non-mutating capability probes",
    ):
        assert stale not in readme
