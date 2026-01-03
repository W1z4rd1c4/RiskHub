import asyncio
import os
import sys

# Add backend directory to python path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv("backend/.env")

from backend.app.integrations.ad_emulator_client import ADEmulatorClient
from backend.app.services.directory_sync_service import DirectorySyncService
from backend.app.db.session import async_session_maker

async def verify():
    print("--- Verifying AD Emulator Integration ---")
    
    # 1. Test Client
    print("\n1. Testing ADEmulatorClient...")
    client = ADEmulatorClient()
    try:
        users = await client.get_users()
        print(f"✅ Successfully fetched {len(users)} users from AD Emulator:")
        for u in users:
            status = "ACTIVE" if u.get('account_enabled') else "DISABLED"
            print(f"   - {u.get('display_name')} ({u.get('email')}) [{status}]")
    except Exception as e:
        print(f"❌ Failed to fetch users: {e}")
        return

    # 2. Test Sync Service Preview
    print("\n2. Testing DirectorySyncService.preview_sync()...")
    async with async_session_maker() as db:
        try:
            preview = await DirectorySyncService.preview_sync(db)
            print("✅ Sync Preview successful:")
            print(f"   - Created: {preview.created_count}")
            print(f"   - Updated: {preview.updated_count}")
            print(f"   - Deactivated: {preview.deactivated_count}")
            print(f"   - Errors: {preview.error_count}")
            
            if preview.diffs:
                print("   Diffs:")
                for diff in preview.diffs[:5]:
                    print(f"     - {diff.action.upper()}: {diff.email or diff.external_id}")
        except Exception as e:
            print(f"❌ Failed to preview sync: {e}")

if __name__ == "__main__":
    asyncio.run(verify())
