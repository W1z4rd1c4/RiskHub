from __future__ import annotations

from dataclasses import dataclass, field

from release_parity_audit.types import CommandResult


@dataclass
class ReleaseParityRunState:
    command_results: list[CommandResult] = field(default_factory=list)
    required_failures: int = 0

    def record_command_result(self, result: CommandResult) -> CommandResult:
        self.command_results.append(result)
        if result.required and result.rc != 0:
            self.required_failures += 1
        return result

