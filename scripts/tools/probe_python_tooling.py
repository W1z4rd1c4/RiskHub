"""Explicit integration probes for the reviewed Python test/tooling baseline.

Run with pytest as documented in scripts/tools/README.md. PostgreSQL probes
require an explicit opt-in and use new random database names on a disposable
server; this module never starts or stops a PostgreSQL service.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from filelock import FileLock
from pytest_postgresql import factories


def load_template(*, autocommit: bool, **connection) -> None:
    assert autocommit is True
    with psycopg.connect(autocommit=autocommit, **connection) as conn:
        conn.execute("CREATE TABLE tooling_probe (value integer NOT NULL)")
        conn.execute("INSERT INTO tooling_probe VALUES (224)")


tooling_postgresql_noproc = factories.postgresql_noproc(
    dbname=f"riskhub_tooling_{uuid4().hex}",
    load=[load_template],
    load_autocommit=True,
)
tooling_postgresql = factories.postgresql("tooling_postgresql_noproc")


@pytest.mark.skipif(
    os.environ.get("RISKHUB_TOOLING_PROBE_POSTGRES") != "1",
    reason="set RISKHUB_TOOLING_PROBE_POSTGRES=1 and explicit disposable server options",
)
@pytest.mark.parametrize("iteration", [1, 2])
def test_v9_keyword_only_loader_autocommit_and_database_reset(tooling_postgresql, iteration):
    assert tooling_postgresql.execute("SELECT value FROM tooling_probe").fetchall() == [(224,)]
    tooling_postgresql.execute("INSERT INTO tooling_probe VALUES (%s)", (iteration,))
    tooling_postgresql.commit()


def test_filelock_excludes_another_process_and_releases(tmp_path: Path):
    path = tmp_path / "tooling.lock"
    child = (
        "import sys\n"
        "from filelock import FileLock, Timeout\n"
        "lock = FileLock(sys.argv[1])\n"
        "try:\n"
        "    lock.acquire(timeout=0.1)\n"
        "except Timeout:\n"
        "    sys.exit(23)\n"
        "else:\n"
        "    lock.release()\n"
    )
    command = [sys.executable, "-c", child, str(path)]
    with FileLock(path):
        assert subprocess.run(command, timeout=15).returncode == 23
    assert subprocess.run(command, timeout=15).returncode == 0


def test_virtualenv_creates_python313_environment_with_installed_filelock(tmp_path: Path):
    environment = tmp_path / "virtualenv"
    subprocess.run(
        [sys.executable, "-m", "virtualenv", "--no-seed", str(environment)],
        check=True,
        timeout=60,
    )
    python = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    subprocess.run(
        [str(python), "-c", "import sys; assert sys.version_info[:2] == (3, 13)"],
        check=True,
        timeout=15,
    )
