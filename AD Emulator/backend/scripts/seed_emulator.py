import asyncio
import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

# Add app to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.models.directory_user import DirectoryUser
from app.db.base import Base

async def seed_emulator():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    
    print("🌱 Seeding AD Emulator with 10 identities...")
    
    users_to_create = [
        {"external_id": "user-001", "display_name": "Thomas Anderson", "email": "neo@matrix.lan", "department": "Core Development", "job_title": "Senior Engineer", "account_enabled": True},
        {"external_id": "user-002", "display_name": "Trinity", "email": "trinity@matrix.lan", "department": "Security Operations", "job_title": "Threat Hunter", "account_enabled": True},
        {"external_id": "user-003", "display_name": "Morpheus", "email": "morpheus@matrix.lan", "department": "Leadership", "job_title": "Captain", "account_enabled": True},
        {"external_id": "user-004", "display_name": "Agent Smith", "email": "smith@system.lan", "department": "System Integrity", "job_title": "Auditor", "account_enabled": False},
        {"external_id": "user-005", "display_name": "Niobe", "email": "niobe@zion.lan", "department": "Logistics", "job_title": "Pilot", "account_enabled": True},
        {"external_id": "user-006", "display_name": "Link", "email": "link@zion.lan", "department": "Operations", "job_title": "Operator", "account_enabled": True},
        {"external_id": "user-007", "display_name": "Cypher", "email": "cypher@zion.lan", "department": "Core Development", "job_title": "Developer", "account_enabled": False},
        {"external_id": "user-008", "display_name": "The Oracle", "email": "oracle@system.lan", "department": "Consulting", "job_title": "Advisor", "account_enabled": True},
        {"external_id": "user-009", "display_name": "Keymaker", "email": "keymaker@system.lan", "department": "Access Management", "job_title": "Access Architect", "account_enabled": True},
        {"external_id": "user-010", "display_name": "Merovingian", "email": "merovingian@matrix.lan", "department": "Information Brokerage", "job_title": "CEO", "account_enabled": True},
    ]
    
    async with async_session() as session:
        for u_data in users_to_create:
            # Check if exists
            result = await session.execute(select(DirectoryUser).where(DirectoryUser.external_id == u_data["external_id"]))
            if result.scalar_one_or_none():
                print(f"⏩ User {u_data['display_name']} already exists, skipping...")
                continue
                
            new_user = DirectoryUser(**u_data)
            session.add(new_user)
            print(f"✅ Created {u_data['display_name']}")
            
        await session.commit()
    
    print("\n🏁 Seeding complete! AD Emulator now has 10 users.")

if __name__ == "__main__":
    asyncio.run(seed_emulator())
