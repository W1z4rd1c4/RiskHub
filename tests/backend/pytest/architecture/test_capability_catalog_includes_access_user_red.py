"""Access-user registration is explicit; the public validator owns typed field parity."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract
ROOT = Path(__file__).resolve().parents[4]


def test_access_user_remains_explicitly_registered_with_valid_schema_references():
    catalog = json.loads((ROOT / "docs/security/capability-catalog.json").read_text())
    entries = [
        surface for surface in catalog["surfaces"] if surface["id"] == "access_user"
    ]
    assert (
        len(entries) == 1
    ), "The reviewed access_user opt-in must be declared exactly once"
    entry = entries[0]
    for side, symbol in [("backend", "class"), ("frontend", "schema")]:
        assert (ROOT / entry[side]["path"]).is_file()
        assert entry[side][symbol]
    assert entry["fields"]
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/security/validate_authz_capability_contract.py"),
            "--skip-doc-touch",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=45,
    )
    assert result.returncode == 0, result.stdout + result.stderr
