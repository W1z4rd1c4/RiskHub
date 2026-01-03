import asyncio
import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select, text

# Add app to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.models.directory_user import DirectoryUser

RISKHUB_DB_URL = "postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub"

async def mirror_users():
    # Source Engine (RiskHub)
    source_engine = create_async_engine(RISKHUB_DB_URL)
    
    # Destination Engine (AD Emulator)
    dest_engine = create_async_engine(settings.DATABASE_URL)
    dest_session = async_sessionmaker(dest_engine, expire_on_commit=False, class_=AsyncSession)
    
    print("🔍 Fetching users from RiskHub...")
    
    users_to_mirror = []
    async with source_engine.connect() as conn:
        # Fetch users joined with department
        result = await conn.execute(text("""
            SELECT u.email, u.name, u.external_id, d.name as department_name 
            FROM users u 
            LEFT JOIN departments d ON u.department_id = d.id 
            ORDER BY u.id ASC 
            LIMIT 15
        """))
        for row in result:
            users_to_mirror.append({
                "email": row.email,
                "display_name": row.name,
                "external_id": row.external_id or f"synced-{row.email.split('@')[0]}",
                "department": row.department_name,
                "account_enabled": True,
                "job_title": "Imported from RiskHub"
            })
            
    print(f"✅ Found {len(users_to_mirror)} users in RiskHub.")
    
    async with dest_session() as session:
        print("🚀 Inserting users into AD Emulator...")
        
        # Clear existing simulated users to avoid confusion (except the one we just created maybe? actually better clear all)
        await session.execute(text("DELETE FROM directory_users"))
        
        for u_data in users_to_mirror:
            new_user = DirectoryUser(**u_data)
            session.add(new_user)
            print(f"  ✓ Mirrored: {u_data['display_name']} ({u_data['email']})")
            
        await session.commit()
    
    print("\n🏁 Mirroring complete! AD Emulator now contains your RiskHub users.")

if __name__ == "__main__":
    asyncio.run(mirror_users())
