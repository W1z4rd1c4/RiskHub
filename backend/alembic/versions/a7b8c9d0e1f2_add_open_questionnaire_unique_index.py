"""add open questionnaire unique index

Revision ID: a7b8c9d0e1f2
Revises: z6a7b8c9d0e1
Create Date: 2026-04-24

"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: str | Sequence[str] | None = "z6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _cleanup_safe_duplicate_open_questionnaires(conn) -> None:
    """Delete blank duplicate open questionnaires before adding the unique index."""
    conn.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT
                    q.id,
                    ROW_NUMBER() OVER (
                        PARTITION BY q.risk_id
                        ORDER BY
                            CASE WHEN q.status = 'in_progress' THEN 0 ELSE 1 END,
                            CASE WHEN q.answers IS NOT NULL THEN 0 ELSE 1 END,
                            CASE WHEN q.updated_at IS NULL THEN 1 ELSE 0 END,
                            q.updated_at DESC,
                            CASE WHEN q.sent_at IS NULL THEN 1 ELSE 0 END,
                            q.sent_at DESC,
                            q.id DESC
                    ) AS rn
                FROM risk_questionnaires q
                WHERE q.status IN ('sent', 'in_progress')
            ),
            safe_duplicates AS (
                SELECT q.id
                FROM risk_questionnaires q
                JOIN ranked r ON r.id = q.id
                WHERE r.rn > 1
                  AND q.answers IS NULL
                  AND q.submitted_at IS NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM risk_questionnaire_clarifications c
                      WHERE c.questionnaire_id = q.id
                  )
            )
            DELETE FROM risk_questionnaires
            WHERE id IN (SELECT id FROM safe_duplicates)
            """
        )
    )


def _remaining_duplicate_open_questionnaires(conn, *, limit: int = 10) -> list[str]:
    duplicate_risks = conn.execute(
        sa.text(
            """
            SELECT risk_id, COUNT(*) AS duplicate_count
            FROM risk_questionnaires
            WHERE status IN ('sent', 'in_progress')
            GROUP BY risk_id
            HAVING COUNT(*) > 1
            ORDER BY risk_id
            LIMIT :limit
            """
        ),
        {"limit": limit},
    ).mappings()

    details: list[str] = []
    for row in duplicate_risks:
        rows = conn.execute(
            sa.text(
                """
                SELECT id, status
                FROM risk_questionnaires
                WHERE risk_id = :risk_id
                  AND status IN ('sent', 'in_progress')
                ORDER BY id
                """
            ),
            {"risk_id": row["risk_id"]},
        ).mappings()
        questionnaires = ", ".join(f"{item['id']}:{item['status']}" for item in rows)
        details.append(
            f"risk_id={row['risk_id']} count={row['duplicate_count']} questionnaires=[{questionnaires}]"
        )
    return details


def _validate_no_duplicate_open_questionnaires(conn) -> None:
    duplicates = _remaining_duplicate_open_questionnaires(conn)
    if duplicates:
        sample = "; ".join(duplicates)
        raise RuntimeError(
            "Cannot create ux_risk_questionnaires_one_open_per_risk because duplicate "
            "sent/in_progress questionnaires remain after safe cleanup. Manually preserve "
            "the real active questionnaire for each risk and remove or submit stale "
            f"duplicates before rerunning this migration. Sample: {sample}"
        )


def upgrade() -> None:
    """Prevent more than one open questionnaire per risk."""
    conn = op.get_bind()
    _cleanup_safe_duplicate_open_questionnaires(conn)
    _validate_no_duplicate_open_questionnaires(conn)
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_risk_questionnaires_one_open_per_risk
        ON risk_questionnaires (risk_id)
        WHERE status IN ('sent', 'in_progress')
        """
    )


def downgrade() -> None:
    """Remove the open-questionnaire uniqueness guard."""
    op.execute("DROP INDEX IF EXISTS ux_risk_questionnaires_one_open_per_risk")
