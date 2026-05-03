from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from install_lib.common import InstallPaths

Command = list[str | Path]


@dataclass(frozen=True)
class LifecycleCommandPlan:
    commands: tuple[Command, ...]
    actions: tuple[str, ...] = ()


def _require_resolved_target(mode: str, resolved_target: str | None) -> str:
    if resolved_target:
        return resolved_target
    raise ValueError(f"{mode} lifecycle command requires a resolved production target")


def build_logs_command(
    *,
    paths: InstallPaths,
    mode: str,
    resolved_target: str | None,
    tail: str,
    follow: bool,
) -> Command:
    if mode == "demo":
        command: Command = [paths.compose_script, "logs", "--tail", tail]
        if follow:
            command.append("--follow")
        return command

    if mode == "dev":
        command = ["tail", "-n", tail]
        if follow:
            command.append("-f")
        command.extend([str(paths.repo_root / ".dev-backend.log"), str(paths.repo_root / ".dev-frontend.log")])
        return command

    target = _require_resolved_target(mode, resolved_target)
    command = [paths.deploy_script, "logs", "--target", target, "--service", "all", "--tail", tail]
    if follow:
        command.append("--follow")
    return command


def build_status_dry_run_commands(
    *,
    paths: InstallPaths,
    mode: str,
    resolved_target: str | None,
) -> list[Command]:
    if mode == "demo":
        return [
            ["docker", "inspect", "riskhub-db"],
            ["docker", "inspect", "riskhub-redis"],
            ["docker", "inspect", "riskhub-backend"],
            ["docker", "inspect", "riskhub-frontend"],
            ["curl", "-fsS", "http://localhost/login"],
            ["curl", "-fsS", "http://localhost/api/v1/auth/config"],
        ]

    if mode == "dev":
        return [
            ["docker", "inspect", "riskhub-db"],
            ["docker", "inspect", "riskhub-redis"],
            ["lsof", "-nP", "-iTCP:8000", "-sTCP:LISTEN"],
            ["lsof", "-nP", "-iTCP:5173", "-sTCP:LISTEN"],
            ["node", "-p", "process.versions.node.split('.')[0]"],
            ["curl", "-fsS", "http://localhost:5173/login"],
            ["curl", "-fsS", "http://localhost:8000/api/v1/readyz"],
            ["curl", "-fsS", "http://localhost:8000/api/v1/auth/config"],
        ]

    target = _require_resolved_target(mode, resolved_target)
    return [[paths.deploy_script, "status", "--target", target]]


def build_doctor_repair_plan(
    *,
    paths: InstallPaths,
    mode: str,
    resolved_target: str | None,
) -> LifecycleCommandPlan:
    if mode == "demo":
        return LifecycleCommandPlan(
            actions=(f"{paths.compose_script} up",),
            commands=([paths.compose_script, "up"],),
        )

    if mode == "dev":
        return LifecycleCommandPlan(
            actions=(
                f"{paths.compose_script} up --profile db-only",
                f"{paths.dev_script} --daemon",
            ),
            commands=(
                [paths.compose_script, "up", "--profile", "db-only"],
                [paths.dev_script, "--daemon"],
            ),
        )

    target = _require_resolved_target(mode, resolved_target)
    return LifecycleCommandPlan(
        actions=(f"{paths.deploy_script} status --target {target}",),
        commands=([paths.deploy_script, "status", "--target", target],),
    )
