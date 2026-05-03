from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

from install_lib.common import SharedOptions, run_command

Command = Iterable[str | Path]


def run_lifecycle_commands(commands: Iterable[Command], *, options: SharedOptions) -> None:
    for command in commands:
        run_command(command, options=options)
