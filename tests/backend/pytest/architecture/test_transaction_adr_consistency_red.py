from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ADR_002 = REPO_ROOT / "docs/adr/ADR-002-service-owned-transactions.md"
ADR_011 = REPO_ROOT / "docs/adr/ADR-011-auth-scheme-and-session-model.md"
ENDPOINT_ALLOWLIST = REPO_ROOT / "tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml"


def test_transaction_adrs_name_current_boundary_and_empty_endpoint_allowlist() -> None:
    adr_002 = ADR_002.read_text()
    adr_011 = ADR_011.read_text()
    allowlist_source = ENDPOINT_ALLOWLIST.read_text()

    assert 'allowlist = []' in allowlist_source
    assert "commit_service_boundary" in adr_002
    assert "_service_commit_boundary_allowlist.toml" in adr_002
    assert "rolls back and logs `transaction_boundary` metadata" in adr_002

    assert "endpoint commit allowlist is empty" in adr_011
    assert "commit_auth_transaction` delegates to `commit_service_boundary" in adr_011
    assert "eight auth-flow" not in adr_011
    assert "<= 8" not in adr_011
    assert "2026-09-01" not in adr_011
