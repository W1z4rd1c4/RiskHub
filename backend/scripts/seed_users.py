"""
Seed script to create 120 test users for the RiskHub application.
Includes 3 demo accounts: CRO, COO, and Operations Employee.
Run this after seeding roles, permissions, and departments.
"""

import asyncio
import random

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import get_password_hash
from app.db.session import session_context
from app.models import Department, Role, User


async def seed_users():
    async with session_context(get_settings()) as db:
        try:
            # Get roles
            result = await db.execute(select(Role))
            roles = {r.name: r for r in result.scalars().all()}
            if not roles:
                print("❌ No roles found. Run seed_roles_permissions.py first!")
                return

            # Get departments
            result = await db.execute(select(Department))
            departments = {d.name: d for d in result.scalars().all()}
            if not departments:
                print("❌ No departments found. Run seed_departments.py first!")
                return

            users_to_create = []

            # 1. C-Suite (4 users)
            print("Creating C-Suite users...")
            c_suite = [
                ("ceo@riskhub.test", "Maria Silva", "ceo", None),
                ("cfo@riskhub.test", "John Chen", "cfo", None),
                ("cro@riskhub.test", "Anna Kowalski", "cro", None),  # DEMO ACCOUNT
                ("coo@riskhub.test", "Robert Johnson", "coo", "Operations"),  # DEMO ACCOUNT
            ]

            for email, name, role_name, dept_name in c_suite:
                users_to_create.append(
                    {
                        "email": email,
                        "name": name,
                        "role_id": roles[role_name].id,
                        "department_id": departments[dept_name].id if dept_name else None,
                        "manager_id": None,
                        "hashed_password": get_password_hash("test123"),
                        "is_active": True,
                    }
                )

            # 2. Governance Roles (6 users)
            print("Creating governance role users...")
            governance = [
                ("risk.manager@riskhub.test", "Sarah Williams", "risk_manager", "Risk Management"),
                ("compliance@riskhub.test", "Michael Brown", "compliance", "Compliance"),
                ("legal@riskhub.test", "Emma Davis", "legal", "Legal"),
                ("audit@riskhub.test", "James Wilson", "internal_audit", None),
                ("actuarial@riskhub.test", "Lisa Anderson", "actuarial", "Actuarial"),
                ("admin@riskhub.test", "System Admin", "admin", None),
            ]

            for email, name, role_name, dept_name in governance:
                users_to_create.append(
                    {
                        "email": email,
                        "name": name,
                        "role_id": roles[role_name].id,
                        "department_id": departments[dept_name].id if dept_name else None,
                        "manager_id": None,
                        "hashed_password": get_password_hash("test123"),
                        "is_active": True,
                    }
                )

            # 3. Department Heads (9 users, one per department except Operations)
            print("Creating department heads...")
            dept_heads = []
            first_names = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Quinn", "Sage"]
            last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez"]

            dept_index = 0
            for dept_name, dept in departments.items():
                if dept_name == "Operations":
                    continue  # COO is already the head

                email = f"{dept_name.lower().replace(' ', '.')}.head@riskhub.test"
                name = f"{first_names[dept_index % len(first_names)]} {last_names[dept_index % len(last_names)]}"

                dept_heads.append(
                    {
                        "email": email,
                        "name": name,
                        "role_id": roles["department_head"].id,
                        "department_id": dept.id,
                        "manager_id": None,  # Will be set to CEO later
                        "hashed_password": get_password_hash("test123"),
                        "is_active": True,
                    }
                )
                dept_index += 1

            users_to_create.extend(dept_heads)

            # Create users in database to get IDs
            print("Creating initial users in database...")
            db_users = {}
            for user_data in users_to_create:
                result = await db.execute(select(User).filter(User.email == user_data["email"]))
                existing = result.scalar_one_or_none()

                if not existing:
                    user = User(**user_data)
                    db.add(user)
                    await db.flush()
                    db_users[user_data["email"]] = user
                    print(f"  ✓ Created {user.name} ({user.email})")
                else:
                    db_users[user_data["email"]] = existing
                    print(f"  - Skipped {existing.name} (already exists)")

            await db.commit()

            # 4. Employees (101 users across departments)
            print("\nCreating employees...")
            employee_count = 0
            first_names_pool = [
                "Emma",
                "Liam",
                "Olivia",
                "Noah",
                "Ava",
                "Ethan",
                "Sophia",
                "Mason",
                "Isabella",
                "William",
                "Mia",
                "James",
                "Charlotte",
                "Benjamin",
                "Amelia",
                "Lucas",
                "Harper",
                "Henry",
                "Evelyn",
                "Alexander",
            ]
            last_names_pool = [
                "Smith",
                "Johnson",
                "Williams",
                "Brown",
                "Jones",
                "Garcia",
                "Miller",
                "Davis",
                "Rodriguez",
                "Martinez",
                "Hernandez",
                "Lopez",
                "Gonzalez",
                "Wilson",
                "Anderson",
                "Thomas",
                "Taylor",
                "Moore",
                "Jackson",
                "Martin",
            ]

            for dept_name, dept in departments.items():
                # Find department head
                result = await db.execute(
                    select(User).filter(User.department_id == dept.id, User.role_id == roles["department_head"].id)
                )
                dept_head = result.scalar_one_or_none()

                if not dept_head and dept_name == "Operations":
                    dept_head = db_users.get("coo@riskhub.test")

                # Create 8-12 employees per department
                num_employees = random.randint(8, 12)

                for i in range(num_employees):
                    employee_count += 1
                    first_name = random.choice(first_names_pool)
                    last_name = random.choice(last_names_pool)
                    email = f"{first_name.lower()}.{last_name.lower()}{employee_count}@riskhub.test"
                    name = f"{first_name} {last_name}"

                    # First employee in Operations is the demo account
                    if dept_name == "Operations" and i == 0:
                        email = "ops.employee@riskhub.test"  # DEMO ACCOUNT
                        name = "Operations Employee"

                    result = await db.execute(select(User).filter(User.email == email))
                    existing = result.scalar_one_or_none()

                    if not existing:
                        employee = User(
                            email=email,
                            name=name,
                            role_id=roles["employee"].id,
                            department_id=dept.id,
                            manager_id=dept_head.id if dept_head else None,
                            hashed_password=get_password_hash("test123"),
                            is_active=True,
                        )
                        db.add(employee)
                        if i == 0:  # Print first employee of each department
                            print(f"  ✓ Created {name} in {dept_name}")

            await db.commit()

            # Set department heads' manager to CEO
            print("\nSetting up management hierarchy...")
            ceo = db_users.get("ceo@riskhub.test")
            if ceo:
                result = await db.execute(select(User).filter(User.role_id == roles["department_head"].id))
                dept_heads_in_db = result.scalars().all()

                for head in dept_heads_in_db:
                    head.manager_id = ceo.id

                # COO also reports to CEO
                coo = db_users.get("coo@riskhub.test")
                if coo:
                    coo.manager_id = ceo.id

            await db.commit()

            # Get final count
            result = await db.execute(select(User))
            total_users = len(result.scalars().all())

            print("\n✅ User seeding complete!")
            print(f"   Total users: {total_users}")
            print("   - 4 C-Suite")
            print("   - 6 Governance roles")
            print(f"   - {len(dept_heads)} Department heads")
            print(f"   - {employee_count} Employees")
            print("\n🔑 Demo Accounts (password: test123):")
            print("   CRO (full access):     cro@riskhub.test")
            print("   COO (dept-scoped):     coo@riskhub.test")
            print("   Employee (limited):    ops.employee@riskhub.test")

        except Exception as e:
            await db.rollback()
            print(f"\n❌ Error seeding users: {e}")
            raise


if __name__ == "__main__":
    print("🌱 Seeding users...")
    asyncio.run(seed_users())
