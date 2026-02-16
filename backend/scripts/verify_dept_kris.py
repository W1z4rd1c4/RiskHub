import asyncio

import httpx


async def verify():
    base_url = "http://localhost:8000/api/v1"

    async with httpx.AsyncClient() as client:
        # 1. Get departments
        resp = await client.get(f"{base_url}/departments")
        depts = resp.json()
        print(f"Found {len(depts)} departments:")
        for d in depts:
            print(f"- {d['name']} (ID: {d['id']}): {d.get('kri_count')} KRIs")

        # Find first dept with KRIs
        dept_with_kris = next((d for d in depts if d.get("kri_count", 0) > 0), None)

        if dept_with_kris:
            dept_id = dept_with_kris["id"]
            print(f"\nChecking department {dept_id} ({dept_with_kris['name']})")

            # 2. Get department detail
            resp = await client.get(f"{base_url}/departments/{dept_id}")
            detail = resp.json()
            print(f"KRI count in detail: {detail.get('kri_count')}")

            # 3. Get department KRIs
            resp = await client.get(f"{base_url}/departments/{dept_id}/kris")
            if resp.status_code == 200:
                kris = resp.json()
                print(f"Fetched {len(kris)} KRIs for department")
                if kris:
                    print(f"First KRI: {kris[0]['metric_name']}")
            else:
                print(f"Failed to fetch KRIs: {resp.status_code}")
                print(resp.text)
        else:
            print("\nNo departments with KRIs found.")


if __name__ == "__main__":
    asyncio.run(verify())
