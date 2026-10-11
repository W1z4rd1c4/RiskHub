"""Apply Risk predicates to final reconstructed facts, never current ORM rows."""

from typing import Any

from sqlalchemy import Boolean, String, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.risk_row_criteria import RISK_SEARCH_FIELDS, RiskRowCriteria, risk_row_predicates

# Eight fact binds plus one ordinal per row: below SQLite's conservative bind and
# compound-select limits, and well below PostgreSQL's parameter limit.
RISK_REPLAY_FILTER_BATCH_SIZE = 50
_TEXT_FIELDS = (*RISK_SEARCH_FIELDS, "status", "risk_type")
_BOOL_FIELDS = ("is_archived", "is_priority")


async def filter_replayed_risk_rows(
    db: AsyncSession, rows: list[dict[str, Any]], criteria: RiskRowCriteria
) -> list[dict[str, Any]]:
    matched_ordinals: set[int] = set()
    for start in range(0, len(rows), RISK_REPLAY_FILTER_BATCH_SIZE):
        statements = [
            select(
                literal(ordinal).label("ordinal"),
                *(literal(row.get(field), type_=String()).label(field) for field in _TEXT_FIELDS),
                *(literal(row.get(field), type_=Boolean()).label(field) for field in _BOOL_FIELDS),
            )
            for ordinal, row in enumerate(rows[start : start + RISK_REPLAY_FILTER_BATCH_SIZE], start=start)
        ]
        facts = union_all(*statements).subquery("replayed_risk_facts")
        result = await db.execute(select(facts.c.ordinal).where(*risk_row_predicates(facts.c, criteria)))
        matched_ordinals.update(result.scalars().all())
    # Ordinals preserve duplicate identities and original tie order across batches.
    matched = [row for ordinal, row in enumerate(rows) if ordinal in matched_ordinals]
    return sorted(matched, key=lambda row: str(row.get("risk_id_code") or ""))
