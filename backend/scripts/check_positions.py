import asyncio
from sqlalchemy import select, func
from app.core.config import get_settings
from app.db.session import session_context
from app.models import Control

async def check_positions():
    async with session_context(get_settings()) as db:
        # Get unique process owner positions
        result = await db.execute(select(Control.process_owner_position).distinct())
        process_owners = [r[0] for r in result.all() if r[0]]
        
        # Get unique executor positions
        result = await db.execute(select(Control.executor_position).distinct())
        executors = [r[0] for r in result.all() if r[0]]
        
        print("--- Process Owner Positions ---")
        for p in sorted(process_owners):
            print(f"- {p}")
            
        print("\n--- Executor Positions ---")
        for e in sorted(executors):
            print(f"- {e}")

if __name__ == "__main__":
    asyncio.run(check_positions())
