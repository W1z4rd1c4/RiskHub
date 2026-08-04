from __future__ import annotations

import re
from dataclasses import dataclass, field

from release_parity_audit.types import CommandResult


_RUN_ID_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")


def validate_run_id(run_id: str) -> str:
    """Return a safe release-parity run ID or reject it before use."""
    if not _RUN_ID_PATTERN.fullmatch(run_id) or ".." in run_id:
        raise ValueError(
            "run ID must be 1-128 ASCII letters, digits, dots, underscores, or "
            "hyphens, start with a letter or digit, and not contain '..'"
        )
    return run_id


@dataclass
class ReleaseParityRunState:
    command_results: list[CommandResult] = field(default_factory=list)
    required_failures: int = 0

    def record_command_result(self, result: CommandResult) -> CommandResult:
        self.command_results.append(result)
        if result.required and result.rc != 0:
            self.required_failures += 1
        return result
