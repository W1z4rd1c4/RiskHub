from __future__ import annotations

import importlib.util
from datetime import UTC, datetime
from pathlib import Path

import pytest
import sqlalchemy as sa


REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATION_PATH = (
    REPO_ROOT
    / "backend"
    / "alembic"
    / "versions"
    / "a7b8c9d0e1f2_add_open_questionnaire_unique_index.py"
)


def _load_migration_module():
    spec = importlib.util.spec_from_file_location("open_questionnaire_unique_index_migration", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _create_questionnaire_tables(conn) -> None:
    metadata = sa.MetaData()
    sa.Table(
        "risk_questionnaires",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("risk_id", sa.Integer, nullable=False),
        sa.Column("status", sa.String, nullable=False),
        sa.Column("answers", sa.Text, nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    sa.Table(
        "risk_questionnaire_clarifications",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("questionnaire_id", sa.Integer, nullable=False),
    )
    metadata.create_all(conn)


@pytest.fixture()
def migration_conn():
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        _create_questionnaire_tables(conn)
        yield conn


def test_open_questionnaire_unique_index_migration_cleans_safe_blank_duplicates(migration_conn):
    migration = _load_migration_module()
    now = datetime(2026, 4, 24, 12, 0, tzinfo=UTC)
    migration_conn.execute(
        sa.text(
            """
            INSERT INTO risk_questionnaires
                (id, risk_id, status, answers, submitted_at, sent_at, updated_at)
            VALUES
                (1, 10, 'sent', NULL, NULL, :old, :old),
                (2, 10, 'sent', NULL, NULL, :newer, :newer),
                (3, 11, 'sent', NULL, NULL, :newer, :newer),
                (4, 11, 'in_progress', NULL, NULL, :old, :old)
            """
        ),
        {
            "old": datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
            "newer": now,
        },
    )

    migration._cleanup_safe_duplicate_open_questionnaires(migration_conn)
    migration._validate_no_duplicate_open_questionnaires(migration_conn)

    rows = migration_conn.execute(
        sa.text("SELECT id, risk_id FROM risk_questionnaires ORDER BY risk_id, id")
    ).all()
    assert rows == [(2, 10), (4, 11)]


def test_open_questionnaire_unique_index_migration_rejects_ambiguous_duplicates(migration_conn):
    migration = _load_migration_module()
    now = datetime(2026, 4, 24, 12, 0, tzinfo=UTC)
    migration_conn.execute(
        sa.text(
            """
            INSERT INTO risk_questionnaires
                (id, risk_id, status, answers, submitted_at, sent_at, updated_at)
            VALUES
                (10, 20, 'in_progress', NULL, NULL, :old, :old),
                (11, 20, 'sent', '{"section": "answered"}', NULL, :newer, :newer),
                (12, 21, 'in_progress', NULL, NULL, :newer, :newer),
                (13, 21, 'sent', NULL, NULL, :old, :old)
            """
        ),
        {
            "old": datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
            "newer": now,
        },
    )
    migration_conn.execute(
        sa.text(
            """
            INSERT INTO risk_questionnaire_clarifications (id, questionnaire_id)
            VALUES (1, 13)
            """
        )
    )

    migration._cleanup_safe_duplicate_open_questionnaires(migration_conn)

    with pytest.raises(RuntimeError, match="duplicate sent/in_progress questionnaires remain"):
        migration._validate_no_duplicate_open_questionnaires(migration_conn)
