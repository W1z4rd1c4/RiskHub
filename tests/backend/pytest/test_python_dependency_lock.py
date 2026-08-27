from __future__ import annotations

import hashlib
import importlib.util
import re
import subprocess
import sys
from pathlib import Path
from types import ModuleType

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


def test_dependency_lock_rejects_syrupy_intent_regression(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    module = _temporary_dependency_lock(
        tmp_path,
        monkeypatch,
        replacements={},
        syrupy_intent_override="4.6.*",
    )

    assert (
        "requirements-dev.in must request syrupy==5.0.* exactly"
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
