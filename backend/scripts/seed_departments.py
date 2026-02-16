"""
Seed script to create departments for the RiskHub application.
Run this before seeding users.
"""
import asyncio
from sqlalchemy import select
from app.core.config import get_settings
from app.db.session import session_context
from app.models import Department


async def seed_departments():
    async with session_context(get_settings()) as db:
        try:
            # Define all 10 departments
            departments_data = [
                ("Operations", "OPS", "Operations and business processes"),
                ("Underwriting", "UW", "Underwriting and risk assessment"),
                ("Claims", "CLM", "Claims processing and management"),
                ("IT", "IT", "Information Technology"),
                ("Finance", "FIN", "Finance and accounting"),
                ("Actuarial", "ACT", "Actuarial analysis and modeling"),
                ("Risk Management", "RISK", "Enterprise risk management"),
                ("Compliance", "COMP", "Regulatory compliance"),
                ("Legal", "LEG", "Legal affairs and counsel"),
                ("Human Resources", "HR", "Human resources and talent management"),
            ]
            
            created_count = 0
            existing_count = 0
            
            for name, code, description in departments_data:
                result = await db.execute(
                    select(Department).filter(Department.name == name)
                )
                existing = result.scalar_one_or_none()
                
                if not existing:
                    dept = Department(name=name, code=code, description=description)
                    db.add(dept)
                    created_count += 1
                    print(f"  ✓ Created department: {name} ({code})")
                else:
                    existing_count += 1
                    print(f"  - Skipped {name} (already exists)")
            
            await db.commit()
            
            print(f"\n✅ Department seeding complete!")
            print(f"   Created: {created_count}")
            print(f"   Already existed: {existing_count}")
            print(f"   Total: {len(departments_data)}")
            
        except Exception as e:
            await db.rollback()
            print(f"\n❌ Error seeding departments: {e}")
            raise


if __name__ == "__main__":
    print("🌱 Seeding departments...")
    asyncio.run(seed_departments())
