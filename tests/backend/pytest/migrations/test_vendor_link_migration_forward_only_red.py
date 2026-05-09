"""RED: ADR-010 forward-only contract on the new migration."""

import inspect

import pytest

from tests.backend.pytest.migrations.conftest import load_vendor_migration

pytestmark = pytest.mark.contract


def test_downgrade_raises_not_implemented() -> None:
    module = load_vendor_migration()
    with pytest.raises(NotImplementedError, match="Forward-only"):
        module.downgrade()


def test_revision_chain_points_at_prior_head() -> None:
    module = load_vendor_migration()
    assert module.revision == "k6l7m8n9o0p1"
    assert module.down_revision == "j5k6l7m8n9o0"


def test_migration_source_cites_adr_010() -> None:
    module = load_vendor_migration()
    source = inspect.getsource(module)
    assert "raise NotImplementedError" in source
    assert "ADR-010" in source
