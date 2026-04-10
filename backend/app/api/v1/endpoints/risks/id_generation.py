from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Risk


async def generate_risk_id_code(db: AsyncSession, process: str) -> str:
    """
    Generate a unique risk_id_code by finding max existing suffix and incrementing.

    Format: {PROCESS_ABBR}-R{NN} where NN is zero-padded sequence number.
    Example: CLAI-R01, CLAI-R02, UNDE-R01

    This function fetches ALL codes matching the prefix and computes max in Python,
    avoiding lexicographic ordering issues (e.g., "R99" > "R100" in string sort).

    Args:
        db: Database session
        process: The process name to derive prefix from

    Returns:
        Unique risk_id_code string (e.g., "CLAI-R102")
    """
    # Generate process abbreviation from first 4 alpha characters
    process_abbr = "".join(c for c in process.upper() if c.isalpha())[:4] or "RISK"
    prefix = f"{process_abbr}-R"
    pattern = f"{prefix}%"

    # Fetch ALL existing codes with this prefix (no limit - we need true max)
    result = await db.execute(select(Risk.risk_id_code).where(Risk.risk_id_code.like(pattern)))
    existing_codes = [row[0] for row in result.all()]

    # Extract max number from existing codes
    max_num = 0
    for code in existing_codes:
        # Extract number after prefix (e.g., "CLAI-R05" -> 5, "CLAI-R100" -> 100)
        suffix = code[len(prefix) :]
        if suffix.isdigit():
            max_num = max(max_num, int(suffix))

    # Return next ID (zero-padded to at least 2 digits)
    return f"{prefix}{max_num + 1:02d}"
