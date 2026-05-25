from sqlalchemy.ext.asyncio import AsyncSession

from app.services.risk_identifier import generate_risk_id_code as _generate_risk_id_code


async def generate_risk_id_code(db: AsyncSession, process: str) -> str:
    """Compatibility re-export required by endpoint package invariants."""
    return await _generate_risk_id_code(db, process)
