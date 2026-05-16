from __future__ import annotations

from pathlib import Path

import pytest

from ._allowlist_expiry import assert_not_expired

pytestmark = pytest.mark.contract


ROOT = Path(__file__).resolve().parents[4]


def test_review_closure_documentation_index_records_accepted_paths_and_decisions() -> None:
    assert_not_expired(ROOT / "tests/backend/pytest/architecture/_naming_allowlist.toml")
    docs = "\n".join(
        [
            (ROOT / "docs/README.md").read_text(),
            (ROOT / "docs/DOCUMENTATION_TREE.md").read_text(),
            (ROOT / "AGENTS.md").read_text(),
            (ROOT / "CLAUDE.md").read_text(),
        ]
    )

    required = {
        "ADR-002": "service-owned transaction rule",
        "ADR-005": "archivable lifecycle rule",
        "ADR-010": "forward-only migration rehearsal contract",
        "tests/frontend/unit/src/authz/useAuthz.invariant.test.ts": "accepted FE authz invariant home",
        "tests/backend/pytest/test_risks.py": "accepted B1 strict department filter coverage",
        "backend/app/services/outbox/dispatcher.py": "outbox transaction runtime owner",
        "ControlStatus.inactive": "retained control lifecycle state",
        "tests/backend/pytest/architecture/_archive_allowlist.toml": "archivable invariant allowlist",
        "tests/backend/pytest/architecture/_naming_allowlist.toml": "persistence naming invariant allowlist",
    }

    for needle, reason in required.items():
        assert needle in docs, f"missing {reason}: {needle}"
