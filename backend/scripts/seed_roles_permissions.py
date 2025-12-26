"""
Seed script to create roles and permissions for the RiskHub application.
Run this before seeding users.
"""
import asyncio
from sqlalchemy import select
from app.db.session import async_session_maker
from app.models import Role, Permission, RolePermission


async def seed_roles_permissions():
    async with async_session_maker() as db:
        try:
            # Create permissions
            permissions_data = [
                ("*", "*", "Full access to all resources"),
                ("risks", "read", "View risks"),
                ("risks", "write", "Create/edit risks"),
                ("risks", "delete", "Delete risks"),
                ("controls", "read", "View controls"),
                ("controls", "write", "Create/edit controls"),
                ("controls", "delete", "Delete controls"),
                ("kris", "read", "View KRIs"),
                ("kris", "write", "Create/edit KRIs"),
                ("reports", "read", "View reports"),
                ("users", "read", "View users"),
                ("users", "write", "Manage users"),
            ]
            
            created_perms = {}
            for resource, action, description in permissions_data:
                result = await db.execute(
                    select(Permission).filter(
                        Permission.resource == resource,
                        Permission.action == action
                    )
                )
                existing = result.scalar_one_or_none()
                
                if not existing:
                    perm = Permission(resource=resource, action=action, description=description)
                    db.add(perm)
                    await db.flush()
                    created_perms[f"{resource}:{action}"] = perm
                    print(f"  ✓ Created permission: {resource}:{action}")
                else:
                    created_perms[f"{resource}:{action}"] = existing
            
            await db.commit()
            
            # Create roles
            roles_config = [
                ("admin", "Administrator", "Full system access"),
                ("ceo", "Chief Executive Officer", "C-Suite executive"),
                ("cfo", "Chief Financial Officer", "C-Suite executive"),
                ("cro", "Chief Risk Officer", "C-Suite executive"),
                ("coo", "Chief Operating Officer", "C-Suite executive"),
                ("risk_manager", "Risk Manager", "Risk management oversight"),
                ("compliance", "Compliance Officer", "Compliance oversight"),
                ("legal", "Legal Counsel", "Legal oversight"),
                ("internal_audit", "Internal Auditor", "Audit oversight"),
                ("actuarial", "Actuarial Function", "Actuarial oversight"),
                ("department_head", "Department Head", "Department manager"),
                ("employee", "Employee", "Standard employee"),
                ("viewer", "Viewer", "Read-only access"),
            ]
            
            created_roles = {}
            for name, display_name, description in roles_config:
                result = await db.execute(select(Role).filter(Role.name == name))
                existing = result.scalar_one_or_none()
                
                if not existing:
                    role = Role(name=name, display_name=display_name, description=description)
                    db.add(role)
                    await db.flush()
                    created_roles[name] = role
                    print(f"  ✓ Created role: {display_name}")
                else:
                    created_roles[name] = existing
            
            await db.commit()
            
            # Assign permissions to roles
            full_access_perm = created_perms.get("*:*")
            
            # Privileged roles get full access
            privileged_roles = ["admin", "ceo", "cfo", "cro", "risk_manager", 
                               "compliance", "legal", "internal_audit", "actuarial"]
            
            for role_name in privileged_roles:
                role = created_roles.get(role_name)
                if role and full_access_perm:
                    result = await db.execute(
                        select(RolePermission).filter(
                            RolePermission.role_id == role.id,
                            RolePermission.permission_id == full_access_perm.id
                        )
                    )
                    existing = result.scalar_one_or_none()
                    
                    if not existing:
                        db.add(RolePermission(role_id=role.id, permission_id=full_access_perm.id))
                        print(f"  ✓ Granted full access to {role.display_name}")
            
            # Department heads and employees get limited permissions
            limited_perms = ["risks:read", "risks:write", "controls:read", "controls:write", "kris:read", "kris:write"]
            
            for role_name in ["department_head", "employee", "coo"]:
                role = created_roles.get(role_name)
                if role:
                    for perm_key in limited_perms:
                        perm = created_perms.get(perm_key)
                        if perm:
                            result = await db.execute(
                                select(RolePermission).filter(
                                    RolePermission.role_id == role.id,
                                    RolePermission.permission_id == perm.id
                                )
                            )
                            existing = result.scalar_one_or_none()
                            
                            if not existing:
                                db.add(RolePermission(role_id=role.id, permission_id=perm.id))
                    print(f"  ✓ Granted limited permissions to {role.display_name}")
            
            # Viewer gets read-only
            viewer_role = created_roles.get("viewer")
            if viewer_role:
                read_perms = ["risks:read", "controls:read", "kris:read", "reports:read"]
                for perm_key in read_perms:
                    perm = created_perms.get(perm_key)
                    if perm:
                        result = await db.execute(
                            select(RolePermission).filter(
                                RolePermission.role_id == viewer_role.id,
                                RolePermission.permission_id == perm.id
                            )
                        )
                        existing = result.scalar_one_or_none()
                        
                        if not existing:
                            db.add(RolePermission(role_id=viewer_role.id, permission_id=perm.id))
                print(f"  ✓ Granted read-only permissions to Viewer")
            
            await db.commit()
            print("\n✅ Roles and permissions seeded successfully!")
            
        except Exception as e:
            await db.rollback()
            print(f"\n❌ Error seeding roles and permissions: {e}")
            raise


if __name__ == "__main__":
    print("🌱 Seeding roles and permissions...")
    asyncio.run(seed_roles_permissions())
