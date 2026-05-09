from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "backend"


def test_alembic_chain_is_clean(alembic_live_db) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = alembic_live_db.database_url
    env["TEST_DATABASE_URL"] = alembic_live_db.database_url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    env.setdefault("SECRET_KEY", "test-secret-key-32-chars-minimum-value")

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "check"],
        cwd=BACKEND_ROOT,
        env=env,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )

    output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, output
    assert "No new upgrade operations detected" in output
