from __future__ import annotations

import os
import subprocess
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from release_parity_audit.artifacts import write_text
from release_parity_audit.types import CommandResult


def run_command(
    command_id: str,
    command: str,
    *,
    cwd: Path,
    logs_dir: Path,
    required: bool,
    timeout_sec: int | None,
    env: dict[str, str] | None,
    utc_now: Callable[[], datetime],
    iso: Callable[[datetime], str],
) -> CommandResult:
    start = utc_now()
    start_epoch = time.time()
    log_path = logs_dir / f"{command_id}.log"
    run_env = os.environ.copy()
    if env:
        run_env.update(env)

    rc = 124
    output = ""
    timed_out = False
    try:
        completed = subprocess.run(
            ["bash", "-c", command],
            cwd=str(cwd),
            env=run_env,
            text=True,
            capture_output=True,
            timeout=timeout_sec,
            check=False,
        )
        rc = completed.returncode
        output = (completed.stdout or "") + (completed.stderr or "")
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        rc = 124
        output = (exc.stdout or "") + (exc.stderr or "")

    end = utc_now()
    end_epoch = time.time()
    duration = round(end_epoch - start_epoch, 3)
    log_body = f"$ {command}\n\n{output}"
    if timed_out:
        log_body += f"\n\n[TIMEOUT] command exceeded {timeout_sec}s\n"
    write_text(log_path, log_body)

    return CommandResult(
        command_id=command_id,
        command=command,
        cwd=str(cwd),
        required=required,
        rc=rc,
        start_utc=iso(start),
        end_utc=iso(end),
        duration_sec=duration,
        log_path=str(log_path),
        timeout_sec=timeout_sec,
    )
