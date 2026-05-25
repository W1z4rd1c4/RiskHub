from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Risk


async def generate_risk_id_code(db: AsyncSession, process: str) -> str:
    """Generate the next risk code for a process prefix."""
    process_abbr = "".join(c for c in process.upper() if c.isalpha())[:4] or "RISK"
    prefix = f"{process_abbr}-R"
    pattern = f"{prefix}%"

    result = await db.execute(select(Risk.risk_id_code).where(Risk.risk_id_code.like(pattern)))
    existing_codes = [row[0] for row in result.all()]

    max_num = 0
    for code in existing_codes:
        suffix = code[len(prefix) :]
        if suffix.isdigit():
            max_num = max(max_num, int(suffix))

    return f"{prefix}{max_num + 1:02d}"
