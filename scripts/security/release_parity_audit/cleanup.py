from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CleanupCommand:
    command_id: str
    command: str


def build_cleanup_command(*, command_id: str, command: str) -> CleanupCommand:
    return CleanupCommand(command_id=command_id, command=command)


def local_dev_cleanup_command() -> CleanupCommand:
    return build_cleanup_command(
        command_id="cleanup_local_dev_processes",
        command=(
            "screen -S riskhub-backend -X quit >/dev/null 2>&1 || true; "
            "screen -S riskhub-frontend -X quit >/dev/null 2>&1 || true; "
            "if [ -f .dev-backend.pid ]; then kill $(cat .dev-backend.pid) >/dev/null 2>&1 || true; fi; "
            "if [ -f .dev-frontend.pid ]; then kill $(cat .dev-frontend.pid) >/dev/null 2>&1 || true; fi"
        ),
    )


def compose_down_command(command_id: str) -> CleanupCommand:
    return build_cleanup_command(
        command_id=command_id,
        command=(
            "if command -v docker-compose >/dev/null 2>&1; then "
            "docker-compose -f docker-compose.yml down --remove-orphans; "
            "else docker compose -f docker-compose.yml down --remove-orphans; fi"
        ),
    )


def stop_local_dev_processes(run_command) -> None:
    command = local_dev_cleanup_command()
    run_command(command.command_id, command.command, required=False)


def compose_down(run_command, command_id: str) -> None:
    command = compose_down_command(command_id)
    run_command(command.command_id, command.command, required=False, timeout_sec=240)
