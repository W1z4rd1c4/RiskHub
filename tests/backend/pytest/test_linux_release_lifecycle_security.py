"""Exercise bundle admission and release switching without touching host services."""

from __future__ import annotations

import hashlib
import os
import shlex
import subprocess
from pathlib import Path

import pytest

from tests.backend.pytest.test_linux_release_bundle_security import REPO_ROOT, _write_bundle


def _bundle(tmp_path: Path, version: str) -> tuple[Path, str]:
    path = tmp_path / f"{version}.tar.gz"
    _write_bundle(path, version)
    return path, hashlib.sha256(path.read_bytes()).hexdigest()


def _deploy(tmp_path: Path, action: str, bundle: Path, digest: str) -> str:
    return shlex.join(
        ["linux_deploy_or_upgrade", action, str(tmp_path / "config.env"), str(bundle), digest]
    )


def _run_lifecycle(tmp_path: Path, commands: str) -> subprocess.CompletedProcess[str]:
    (tmp_path / "config.env").write_text("AUTH_MODE=microsoft_sso\nDIRECTORY_PROVIDER=graph\n")
    (tmp_path / "scratch").mkdir(exist_ok=True)
    (tmp_path / "calls").write_text("")
    quote = shlex.quote
    script = f"""
set -euo pipefail
source {quote(str(REPO_ROOT / 'scripts/deploy/lib/common.sh'))}
source {quote(str(REPO_ROOT / 'scripts/deploy/lib/linux.sh'))}
DRY_RUN=false
export TMPDIR={quote(str(tmp_path / 'scratch'))}
LINUX_RELEASES_DIR={quote(str(tmp_path / 'releases'))}
LINUX_CURRENT_LINK={quote(str(tmp_path / 'current'))}
LINUX_PREVIOUS_LINK={quote(str(tmp_path / 'previous'))}
LINUX_BACKEND_ENV={quote(str(tmp_path / 'backend.env'))}
RUNTIME_DIR={quote(str(tmp_path / 'runtime'))}
CALLS={quote(str(tmp_path / 'calls'))}
FAIL_STAGE=''
linux_preflight() {{ echo preflight >> "$CALLS"; }}
confirm_or_die() {{ :; }}
ensure_linux_user() {{ :; }}
run_privileged() {{
  printf '%s\n' "$*" >> "$CALLS"
  case "$1" in
    chown|systemctl) return 0 ;;
    mkdir|cp|ln|rm) "$@" ;;
    *) echo "Unexpected privileged operation: $1" >&2; return 99 ;;
  esac
}}
linux_install_venvs() {{ echo venv >> "$CALLS"; }}
linux_identity_preflight() {{
  echo identity >> "$CALLS"
  [[ "$FAIL_STAGE" != identity ]] || return 74
}}
linux_render_runtime_files() {{ echo render >> "$CALLS"; cp "$1" "$LINUX_BACKEND_ENV"; }}
linux_run_db_tasks() {{
  echo database >> "$CALLS"
  [[ "$FAIL_STAGE" != database ]] || return 75
}}
linux_reload_services() {{
  echo reload >> "$CALLS"
  [[ "$FAIL_STAGE" != reload ]] || return 76
}}
linux_smoke() {{
  echo smoke >> "$CALLS"
  [[ "$FAIL_STAGE" != smoke ]] || return 77
}}
{commands}
"""
    return subprocess.run(
        ["bash", "-c", script], cwd=REPO_ROOT, env=os.environ.copy(),
        capture_output=True, text=True, check=False,
    )


def _assert_temporary_archives_removed(tmp_path: Path) -> None:
    assert not list((tmp_path / "scratch").iterdir())


def test_verified_install_upgrade_and_rollback_preserve_releases(tmp_path: Path) -> None:
    first, first_digest = _bundle(tmp_path, "v-first")
    second, second_digest = _bundle(tmp_path, "v-second")
    result = _run_lifecycle(
        tmp_path,
        f"""
{_deploy(tmp_path, 'deploy', first, first_digest)}
[[ "$(readlink "$LINUX_CURRENT_LINK")" == "$LINUX_RELEASES_DIR/v-first" ]]
{_deploy(tmp_path, 'upgrade', second, second_digest)}
[[ "$(readlink "$LINUX_CURRENT_LINK")" == "$LINUX_RELEASES_DIR/v-second" ]]
[[ "$(readlink "$LINUX_PREVIOUS_LINK")" == "$LINUX_RELEASES_DIR/v-first" ]]
: > "$CALLS"
linux_rollback {shlex.quote(str(tmp_path / 'config.env'))}
""",
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert (tmp_path / "current").resolve() == tmp_path / "releases/v-first"
    assert (tmp_path / "previous").resolve() == tmp_path / "releases/v-second"
    for version in ("v-first", "v-second"):
        assert (tmp_path / "releases" / version / "backend/app.txt").read_bytes() == b"trusted release payload\n"
    calls = (tmp_path / "calls").read_text().splitlines()
    assert calls.index("identity") < next(i for i, call in enumerate(calls) if call.startswith("ln -sfn"))
    assert calls[-2:] == ["reload", "smoke"]
    assert "database" not in calls  # Rollback must not rerun or reverse migrations.
    _assert_temporary_archives_removed(tmp_path)


def test_replacing_download_after_verification_cannot_replace_installed_bytes(tmp_path: Path) -> None:
    bundle, digest = _bundle(tmp_path, "v-snapshot")
    result = _run_lifecycle(
        tmp_path,
        f"""
linux_preflight() {{
  local snapshots=("$TMPDIR"/riskhub-linux-verified.*)
  [[ "${{#snapshots[@]}}" == 1 ]]
  [[ "$(stat -c %a "${{snapshots[0]}}")" == 700 ]]
  printf 'replaced after authentication' > {shlex.quote(str(bundle))}
}}
{_deploy(tmp_path, 'deploy', bundle, digest)}
""",
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert bundle.read_bytes() == b"replaced after authentication"
    assert (tmp_path / "current/backend/app.txt").read_bytes() == b"trusted release payload\n"
    _assert_temporary_archives_removed(tmp_path)


@pytest.mark.parametrize("action", ["deploy", "upgrade"])
def test_wrong_digest_stops_before_preflight_or_privileged_actions(tmp_path: Path, action: str) -> None:
    bundle, digest = _bundle(tmp_path, "v-rejected")
    wrong_digest = ("0" if digest[0] != "0" else "1") + digest[1:]
    result = _run_lifecycle(tmp_path, _deploy(tmp_path, action, bundle, wrong_digest))
    assert result.returncode != 0
    assert "SHA-256 mismatch" in result.stderr
    assert not (tmp_path / "calls").read_text()
    assert not (tmp_path / "releases").exists()
    _assert_temporary_archives_removed(tmp_path)


@pytest.mark.parametrize("stage,code", [("identity", 74), ("database", 75), ("reload", 76), ("smoke", 77)])
@pytest.mark.parametrize("action", ["deploy", "upgrade"])
def test_failed_install_cleans_only_unactivated_candidate(
    tmp_path: Path, action: str, stage: str, code: int
) -> None:
    candidate, candidate_digest = _bundle(tmp_path, "v-candidate")
    setup = ""
    if action == "upgrade":
        previous, previous_digest = _bundle(tmp_path, "v-previous")
        setup = _deploy(tmp_path, "deploy", previous, previous_digest)
    result = _run_lifecycle(
        tmp_path,
        f"""
{setup}
: > "$CALLS"
FAIL_STAGE={stage}
{_deploy(tmp_path, action, candidate, candidate_digest)}
""",
    )
    assert result.returncode == code, result.stdout + result.stderr
    activated = stage in {"reload", "smoke"}
    assert (tmp_path / "releases/v-candidate").exists() == activated
    if activated:
        assert (tmp_path / "current").resolve() == tmp_path / "releases/v-candidate"
    elif action == "upgrade":
        assert (tmp_path / "current").resolve() == tmp_path / "releases/v-previous"
    else:
        assert not (tmp_path / "current").exists()
    if action == "upgrade":
        assert (tmp_path / "releases/v-previous/backend/app.txt").read_bytes() == b"trusted release payload\n"
        if activated:
            assert (tmp_path / "previous").resolve() == tmp_path / "releases/v-previous"
        else:
            assert not (tmp_path / "previous").exists()
    if stage == "identity":
        calls = (tmp_path / "calls").read_text()
        assert "systemctl" not in calls and "render" not in calls and "database" not in calls
    _assert_temporary_archives_removed(tmp_path)


def test_reusing_existing_version_cannot_delete_current_release(tmp_path: Path) -> None:
    bundle, digest = _bundle(tmp_path, "v-existing")
    result = _run_lifecycle(
        tmp_path,
        f"{_deploy(tmp_path, 'deploy', bundle, digest)}\n{_deploy(tmp_path, 'upgrade', bundle, digest)}",
    )
    assert result.returncode != 0
    assert "Release directory already exists" in result.stderr
    assert (tmp_path / "current").resolve() == tmp_path / "releases/v-existing"
    assert (tmp_path / "current/backend/app.txt").read_bytes() == b"trusted release payload\n"
    _assert_temporary_archives_removed(tmp_path)
