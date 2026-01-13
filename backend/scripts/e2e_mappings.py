"""
Shared ID mappings for E2E seed scripts.
Populated by load_mappings() function, used by other scripts.
"""
from sqlalchemy import select


# User email -> ID mappings (populated at runtime)
USERS = {
    "cro@riskhub.local": None,
    "risk.manager@riskhub.local": None,
    "ops.head@riskhub.local": None,
    "fin.head@riskhub.local": None,
    "it.head@riskhub.local": None,
    "ops.analyst@riskhub.local": None,
    "fin.analyst@riskhub.local": None,
    "it.analyst@riskhub.local": None,
}

# Department name -> ID mappings (populated at runtime)
DEPARTMENTS = {
    "Operations": None,
    "Finance": None,
    "IT": None,
    "Compliance": None,
    "Risk Management": None,
}


async def load_mappings(db):
    """Load actual IDs from database."""
    from app.models import User, Department
    
    users = {}
    for email in USERS:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            users[email] = user.id
    
    departments = {}
    for name in DEPARTMENTS:
        result = await db.execute(select(Department).where(Department.name == name))
        dept = result.scalar_one_or_none()
        if dept:
            departments[name] = dept.id
    
    return users, departments
