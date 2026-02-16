#!/usr/bin/env python3
"""
Integration test script for data consistency verification.
Tests against running API to ensure counts match across all views.

Usage:
    python verify_data_consistency.py                           # Basic run (no auth)
    AUTH_TOKEN=<token> python verify_data_consistency.py        # With auth token
    python verify_data_consistency.py --base-url http://host:8000  # Custom base URL
"""

import argparse
import asyncio
import os
import sys

import httpx


class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    RESET = "\033[0m"


def parse_args():
    parser = argparse.ArgumentParser(description="Verify data consistency across API endpoints")
    parser.add_argument(
        "--base-url",
        type=str,
        default="http://localhost:8000",
        help="Base URL of the API (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--token",
        type=str,
        default=os.environ.get("AUTH_TOKEN", ""),
        help="Bearer token for authentication (or set AUTH_TOKEN env var)",
    )
    return parser.parse_args()


async def fetch_all_paginated(
    client: httpx.AsyncClient, url: str, headers: dict, page_size: int = 100
) -> tuple[list, int]:
    """
    Fetch all items from a paginated endpoint.

    Handles both paginated responses (with items/total) and raw list responses.
    Iterates through all pages when total exceeds page size.

    Returns:
        tuple of (all_items, total_count)
    """
    all_items = []
    page = 1
    total = None

    while True:
        # Try with pagination params
        resp = await client.get(url, params={"page": page, "size": page_size}, headers=headers)

        if resp.status_code == 401:
            raise Exception("Authentication required - set AUTH_TOKEN env var or use --token")

        resp.raise_for_status()
        data = resp.json()

        # Handle different response formats
        if isinstance(data, list):
            # Raw list response (no pagination)
            return data, len(data)

        if isinstance(data, dict):
            items = data.get("items", [])
            total = data.get("total", len(items))
            all_items.extend(items)

            # Check if we've fetched everything
            if len(all_items) >= total or len(items) == 0:
                break

            page += 1
        else:
            # Unknown format
            return [], 0

    return all_items, total


async def test_data_consistency(base_url: str = "http://localhost:8000", token: str = ""):
    """Run all data consistency checks."""
    api_url = f"{base_url}/api/v1"
    passed = 0
    failed = 0

    # Set up headers with optional auth
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        print("🔐 Using authentication token\n")

    async with httpx.AsyncClient(timeout=30.0) as client:
        print("\n=== Data Consistency Verification ===\n")

        # Test 1: Risk count consistency
        print("1. Testing risk count consistency...")
        try:
            risks, total_risks = await fetch_all_paginated(client, f"{api_url}/risks", headers)
            print(f"   {Colors.BLUE}ℹ{Colors.RESET} Fetched {len(risks)} risks (total: {total_risks})")

            resp = await client.get(f"{api_url}/departments", headers=headers)
            depts = resp.json()
            dept_risk_sum = sum(d.get("risk_count", 0) for d in depts)

            if total_risks == dept_risk_sum:
                print(f"   {Colors.GREEN}✓ PASS{Colors.RESET}: {total_risks} risks = {dept_risk_sum} from departments")
                passed += 1
            else:
                print(f"   {Colors.RED}✗ FAIL{Colors.RESET}: {total_risks} risks ≠ {dept_risk_sum} from departments")
                failed += 1
        except Exception as e:
            print(f"   {Colors.RED}✗ ERROR{Colors.RESET}: {e}")
            failed += 1

        # Test 2: Control count consistency
        print("2. Testing control count consistency...")
        try:
            controls, total_controls = await fetch_all_paginated(client, f"{api_url}/controls", headers)
            print(f"   {Colors.BLUE}ℹ{Colors.RESET} Fetched {len(controls)} controls (total: {total_controls})")

            resp = await client.get(f"{api_url}/departments", headers=headers)
            depts = resp.json()
            dept_control_sum = sum(d.get("control_count", 0) for d in depts)

            if total_controls == dept_control_sum:
                print(
                    f"   {Colors.GREEN}✓ PASS{Colors.RESET}: "
                    f"{total_controls} controls = {dept_control_sum} from departments"
                )
                passed += 1
            else:
                print(
                    f"   {Colors.RED}✗ FAIL{Colors.RESET}: "
                    f"{total_controls} controls ≠ {dept_control_sum} from departments"
                )
                failed += 1
        except Exception as e:
            print(f"   {Colors.RED}✗ ERROR{Colors.RESET}: {e}")
            failed += 1

        # Test 3: KRI count consistency
        print("3. Testing KRI count consistency...")
        try:
            kris, total_kris = await fetch_all_paginated(client, f"{api_url}/kris", headers)
            print(f"   {Colors.BLUE}ℹ{Colors.RESET} Fetched {len(kris)} KRIs (total: {total_kris})")

            resp = await client.get(f"{api_url}/departments", headers=headers)
            depts = resp.json()
            dept_kri_sum = sum(d.get("kri_count", 0) for d in depts)

            if total_kris == dept_kri_sum:
                print(f"   {Colors.GREEN}✓ PASS{Colors.RESET}: {total_kris} KRIs = {dept_kri_sum} from departments")
                passed += 1
            else:
                print(f"   {Colors.RED}✗ FAIL{Colors.RESET}: {total_kris} KRIs ≠ {dept_kri_sum} from departments")
                failed += 1
        except Exception as e:
            print(f"   {Colors.RED}✗ ERROR{Colors.RESET}: {e}")
            failed += 1

        # Test 4: All KRIs link to valid risks
        print("4. Testing KRI->Risk foreign key integrity...")
        try:
            kris, _ = await fetch_all_paginated(client, f"{api_url}/kris", headers)
            risks, _ = await fetch_all_paginated(client, f"{api_url}/risks", headers)
            risk_ids = {r["id"] for r in risks}

            orphaned = [k["id"] for k in kris if k.get("risk_id") not in risk_ids]

            if not orphaned:
                print(f"   {Colors.GREEN}✓ PASS{Colors.RESET}: All {len(kris)} KRIs link to valid risks")
                passed += 1
            else:
                print(f"   {Colors.RED}✗ FAIL{Colors.RESET}: {len(orphaned)} orphaned KRIs: {orphaned[:5]}")
                failed += 1
        except Exception as e:
            print(f"   {Colors.RED}✗ ERROR{Colors.RESET}: {e}")
            failed += 1

        # Test 5: All risks link to valid departments
        print("5. Testing Risk->Department foreign key integrity...")
        try:
            risks, _ = await fetch_all_paginated(client, f"{api_url}/risks", headers)
            resp = await client.get(f"{api_url}/departments", headers=headers)
            depts = resp.json()
            dept_ids = {d["id"] for d in depts}

            orphaned = [r["id"] for r in risks if r.get("department_id") not in dept_ids]

            if not orphaned:
                print(f"   {Colors.GREEN}✓ PASS{Colors.RESET}: All {len(risks)} risks link to valid departments")
                passed += 1
            else:
                print(f"   {Colors.RED}✗ FAIL{Colors.RESET}: {len(orphaned)} orphaned risks: {orphaned[:5]}")
                failed += 1
        except Exception as e:
            print(f"   {Colors.RED}✗ ERROR{Colors.RESET}: {e}")
            failed += 1

        # Test 6: Pagination accuracy check
        print("6. Testing pagination accuracy (total vs items count)...")
        try:
            # Fetch with small page size to force pagination
            all_risks, reported_total = await fetch_all_paginated(client, f"{api_url}/risks", headers, page_size=10)

            if len(all_risks) == reported_total:
                print(
                    f"   {Colors.GREEN}✓ PASS{Colors.RESET}: "
                    f"Pagination accurate ({len(all_risks)} items, total: {reported_total})"
                )
                passed += 1
            else:
                print(
                    f"   {Colors.RED}✗ FAIL{Colors.RESET}: Fetched {len(all_risks)} but total reported {reported_total}"
                )
                failed += 1
        except Exception as e:
            print(f"   {Colors.RED}✗ ERROR{Colors.RESET}: {e}")
            failed += 1

        # Summary
        print(f"\n{'='*40}")
        total = passed + failed
        print(f"Results: {passed}/{total} passed")
        if failed == 0:
            print(f"{Colors.GREEN}All tests passed!{Colors.RESET}")
            return 0
        else:
            print(f"{Colors.RED}{failed} test(s) failed{Colors.RESET}")
            return 1


if __name__ == "__main__":
    args = parse_args()
    sys.exit(asyncio.run(test_data_consistency(base_url=args.base_url, token=args.token)))
