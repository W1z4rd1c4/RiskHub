import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import create_access_token
from app.api import deps
from app.models import User, Role
from sqlalchemy import select

@pytest.mark.asyncio
async def test_all_role_restrictions():
    transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # --- TEST 1: CRO PROTECTIONS ---
        # 1. Get CRO user and generate token directly
        async with app.state.db_sessionmaker() as db:
            result = await db.execute(
                select(User).join(Role).where(Role.name == "cro").limit(1)
            )
            cro_user = result.scalar_one()
            token = create_access_token(data={"sub": cro_user.email, "user_id": cro_user.id})
            headers = {"Authorization": f"Bearer {token}"}

        # 2. Try to update CRO, Admin, or Viewer role (Should fail)
        async with app.state.db_sessionmaker() as db:
            for role_name in ["cro", "admin", "viewer"]:
                role_result = await db.execute(select(Role).where(Role.name == role_name))
                role_obj = role_result.scalar_one()
                
                update_resp = await ac.patch(
                    f"/api/v1/riskhub/roles/{role_obj.id}",
                    json={"display_name": f"New {role_name} Title"},
                    headers=headers
                )
                assert update_resp.status_code == 400
                assert "cannot be modified" in update_resp.json()["detail"]

        # 3. Try to delete Admin role (Should fail)
        async with app.state.db_sessionmaker() as db:
            role_result = await db.execute(select(Role).where(Role.name == "admin"))
            admin_role = role_result.scalar_one()
            
            delete_resp = await ac.delete(
                f"/api/v1/riskhub/roles/{admin_role.id}",
                headers=headers
            )
            assert delete_resp.status_code == 400
            assert "Cannot delete protected system role" in delete_resp.json()["detail"]

        # --- TEST 2: ADMIN RESTRICTIONS ---
        # 4. Get Admin user and generate token directly
        async with app.state.db_sessionmaker() as db:
            result = await db.execute(
                select(User).join(Role).where(Role.name == "admin").limit(1)
            )
            admin_user = result.scalar_one()
            token = create_access_token(data={"sub": admin_user.email, "user_id": admin_user.id})
            admin_headers = {"Authorization": f"Bearer {token}"}

        # 5. Try to access Risk Hub Risk Types (Should be 403 because admin is no longer privileged)
        resp = await ac.get("/api/v1/riskhub/risk-types", headers=admin_headers)
        assert resp.status_code == 403
        
        # 6. Access Admin Console (Should still work)
        resp = await ac.get("/api/v1/admin/health", headers=admin_headers)
        assert resp.status_code == 200
