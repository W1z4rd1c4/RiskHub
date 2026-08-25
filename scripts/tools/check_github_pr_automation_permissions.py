#!/usr/bin/env python3
"""Fail fast unless the lock-refresh credential can push and open pull requests."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

API_ROOT = "https://api.github.com"


@dataclass(frozen=True)
class GitHubContext:
    repository: str
    token: str
    run_id: str


def _context() -> GitHubContext:
    repository = os.environ.get("GITHUB_REPOSITORY", "").strip()
    token = os.environ.get("GH_TOKEN", "").strip()
    run_id = os.environ.get("GITHUB_RUN_ID", "local").strip() or "local"
    if not repository or "/" not in repository:
        raise RuntimeError("GITHUB_REPOSITORY must be owner/repository")
    if not token:
        raise RuntimeError("GH_TOKEN is required")
    return GitHubContext(repository=repository, token=token, run_id=run_id)


def _request(
    context: GitHubContext,
    path: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any]]:
    data = None
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {context.token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "riskhub-python-lock-refresh-permission-probe",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        f"{API_ROOT}{path}",
        data=data,
        method=method,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"message": raw}
        return exc.code, body


def _require_repository_push(context: GitHubContext) -> None:
    status, repository = _request(context, f"/repos/{context.repository}")
    if status != 200:
        raise RuntimeError(
            f"repository permission probe failed with HTTP {status}: "
            f"{repository.get('message', 'unknown error')}"
        )
    permissions = repository.get("permissions")
    if not isinstance(permissions, dict) or permissions.get("push") is not True:
        raise RuntimeError(
            "automation token lacks repository Contents write capability "
            "(repository permissions.push is false)"
        )


def _run_command(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
    )


def _require_git_push_dry_run(context: GitHubContext) -> None:
    auth = _run_command(["gh", "auth", "setup-git"])
    if auth.returncode != 0:
        detail = (auth.stderr or auth.stdout).strip()
        raise RuntimeError(f"unable to configure git authentication: {detail}")

    probe_branch = f"automation/permission-probe-{context.run_id}"
    result = _run_command(
        [
            "git",
            "push",
            "--dry-run",
            "origin",
            f"HEAD:refs/heads/{probe_branch}",
        ]
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"automation token cannot push a refresh branch: {detail}")


def _require_pull_request_endpoint(context: GitHubContext) -> None:
    # An empty create-PR payload is structurally incapable of creating a PR. An
    # authorized token reaches request validation and receives 422; a token
    # without pull-request write access fails authorization first.
    status, body = _request(
        context,
        f"/repos/{context.repository}/pulls",
        method="POST",
        payload={},
    )
    if status == 422:
        return
    if status in {401, 403, 404}:
        raise RuntimeError(
            "automation token cannot use the repository pull-request write endpoint: "
            f"HTTP {status} {body.get('message', 'unknown error')}"
        )
    if status == 201:
        number = body.get("number")
        if isinstance(number, int):
            _request(
                context,
                f"/repos/{context.repository}/pulls/{number}",
                method="PATCH",
                payload={"state": "closed"},
            )
        raise RuntimeError(
            "permission probe unexpectedly created a pull request from an empty payload"
        )
    raise RuntimeError(
        f"unexpected pull-request permission probe response: HTTP {status} "
        f"{body.get('message', 'unknown error')}"
    )


def check_permissions(context: GitHubContext) -> None:
    _require_repository_push(context)
    _require_git_push_dry_run(context)
    _require_pull_request_endpoint(context)


def main() -> int:
    try:
        check_permissions(_context())
    except RuntimeError as exc:
        print(f"automation-permission error: {exc}", file=sys.stderr)
        return 1

    print(
        "Automation credential permission probe: Contents write, branch dry-run, "
        "and pull-request endpoint available"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
