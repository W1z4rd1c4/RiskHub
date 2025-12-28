#!/usr/bin/env python3
"""
Integration test script for data consistency verification.
Tests against running API to ensure counts match across all views.
"""
import asyncio
import sys
import httpx


class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    RESET = '\033[0m'


async def test_data_consistency():
    """Run all data consistency checks."""
    base_url = "http://localhost:8000/api/v1"
    passed = 0
    failed = 0
    
    async with httpx.AsyncClient() as client:
        print("\n=== Data Consistency Verification ===\n")
        
        # Test 1: Risk count consistency
        print("1. Testing risk count consistency...")
        try:
            resp = await client.get(f"{base_url}/risks?size=1000")
            risks_resp = resp.json()
            total_risks = len(risks_resp.get("items", risks_resp if isinstance(risks_resp, list) else []))
            
            resp = await client.get(f"{base_url}/departments")
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
            resp = await client.get(f"{base_url}/controls?size=1000")
            controls_resp = resp.json()
            total_controls = len(controls_resp.get("items", controls_resp if isinstance(controls_resp, list) else []))
            
            resp = await client.get(f"{base_url}/departments")
            depts = resp.json()
            dept_control_sum = sum(d.get("control_count", 0) for d in depts)
            
            if total_controls == dept_control_sum:
                print(f"   {Colors.GREEN}✓ PASS{Colors.RESET}: {total_controls} controls = {dept_control_sum} from departments")
                passed += 1
            else:
                print(f"   {Colors.RED}✗ FAIL{Colors.RESET}: {total_controls} controls ≠ {dept_control_sum} from departments")
                failed += 1
        except Exception as e:
            print(f"   {Colors.RED}✗ ERROR{Colors.RESET}: {e}")
            failed += 1
        
        # Test 3: KRI count consistency
        print("3. Testing KRI count consistency...")
        try:
            resp = await client.get(f"{base_url}/kris?size=1000")
            kris_resp = resp.json()
            total_kris = len(kris_resp.get("items", kris_resp if isinstance(kris_resp, list) else []))
            
            resp = await client.get(f"{base_url}/departments")
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
            resp = await client.get(f"{base_url}/kris?size=1000")
            kris_resp = resp.json()
            kris = kris_resp.get("items", kris_resp if isinstance(kris_resp, list) else [])
            
            resp = await client.get(f"{base_url}/risks?size=1000")
            risks_resp = resp.json()
            risks = risks_resp.get("items", risks_resp if isinstance(risks_resp, list) else [])
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
            resp = await client.get(f"{base_url}/risks?size=1000")
            risks_resp = resp.json()
            risks = risks_resp.get("items", risks_resp if isinstance(risks_resp, list) else [])
            
            resp = await client.get(f"{base_url}/departments")
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
    sys.exit(asyncio.run(test_data_consistency()))
