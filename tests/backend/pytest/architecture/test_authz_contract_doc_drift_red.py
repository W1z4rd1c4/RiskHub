from __future__ import annotations

from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[4]
CONTRACT_MD = REPO_ROOT / "docs/security/authorization-capability-contract.md"

pytestmark = pytest.mark.contract


def test_strict_capabilities_docs_reference_canonical_config_and_invariant_paths() -> None:
    contract = CONTRACT_MD.read_text(encoding="utf-8")

    assert "/api/v1/config/flags" not in contract
    assert "frontend/tests/frontend/unit/src/authz/useAuthz.invariant.test.ts" not in contract
    assert "/auth/config" in contract
    assert "tests/frontend/unit/src/authz/useAuthz.invariant.test.ts" in contract
