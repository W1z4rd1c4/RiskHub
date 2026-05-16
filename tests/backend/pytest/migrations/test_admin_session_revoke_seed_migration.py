from __future__ import annotations

from pathlib import Path


def test_admin_session_revoke_seed_migration_is_forward_only_and_idempotent() -> None:
    migration_path = (
        Path(__file__).parents[4]
        / "backend"
        / "alembic"
        / "versions"
        / "l7m8n9o0p1q2_grant_admin_session_revoke_to_admin.py"
    )

    source = migration_path.read_text()

    assert 'down_revision: Union[str, Sequence[str], None] = "k6l7m8n9o0p1"' in source
    assert "WHERE NOT EXISTS" in source
    assert "'admin'" in source
    assert "'session.revoke'" in source
    assert "Forward-only migration. Restore from snapshot per ADR-010." in source
