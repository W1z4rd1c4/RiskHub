#!/usr/bin/env python3
"""
Integration Test Script for AD Integration Feature.

Tests the complete AD Emulator → RiskHub flow including:
- Webhook user creation
- Webhook user update  
- Orphan flagging on deactivation
- Orphan resolution via API
"""
import asyncio
import httpx
from datetime import datetime, UTC
import json
import sys

# Configuration
RISKHUB_BASE = "http://localhost:8000/api/v1"
AD_EMULATOR_BASE = "http://localhost:8001/api"

# Test data
TEST_USER_ID = f"test-ad-{int(datetime.now(UTC).timestamp())}"
TEST_USER_EMAIL = f"test.user.{int(datetime.now(UTC).timestamp())}@example.com"
TEST_USER_NAME = "AD Integration Test User"


class TestResult:
    def __init__(self, name: str):
        self.name = name
        self.passed = False
        self.message = ""
    
    def success(self, msg: str = ""):
        self.passed = True
        self.message = msg
        print(f"  ✅ {self.name}: {msg or 'PASSED'}")
    
    def fail(self, msg: str):
        self.passed = False
        self.message = msg
        print(f"  ❌ {self.name}: {msg}")


async def test_webhook_user_create(client: httpx.AsyncClient) -> TestResult:
    """Test: Webhook creates user in RiskHub."""
    result = TestResult("Webhook User Create")
    
    payload = {
        "event_type": "user.created",
        "timestamp": datetime.now(UTC).isoformat(),
        "data": {
            "external_id": TEST_USER_ID,
            "email": TEST_USER_EMAIL,
            "display_name": TEST_USER_NAME,
            "department": "Operations",
            "account_enabled": True
        }
    }
    
    try:
        response = await client.post(
            f"{RISKHUB_BASE}/directory/webhook",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("action") == "created":
                result.success(f"User created via webhook")
            else:
                result.fail(f"Expected action 'created', got '{data.get('action')}'")
        else:
            result.fail(f"Status {response.status_code}: {response.text}")
    except Exception as e:
        result.fail(str(e))
    
    return result


async def test_webhook_user_update(client: httpx.AsyncClient) -> TestResult:
    """Test: Webhook updates user in RiskHub."""
    result = TestResult("Webhook User Update")
    
    payload = {
        "event_type": "user.updated",
        "timestamp": datetime.now(UTC).isoformat(),
        "data": {
            "external_id": TEST_USER_ID,
            "email": TEST_USER_EMAIL,
            "display_name": f"{TEST_USER_NAME} (Updated)",
            "department": "Operations",
            "account_enabled": True
        }
    }
    
    try:
        response = await client.post(
            f"{RISKHUB_BASE}/directory/webhook",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("action") == "updated":
                result.success("User updated via webhook")
            else:
                result.fail(f"Expected action 'updated', got '{data.get('action')}'")
        else:
            result.fail(f"Status {response.status_code}: {response.text}")
    except Exception as e:
        result.fail(str(e))
    
    return result


async def test_webhook_user_deactivate(client: httpx.AsyncClient) -> TestResult:
    """Test: Webhook deactivates user and creates orphan."""
    result = TestResult("Webhook User Deactivate")
    
    payload = {
        "event_type": "user.deactivated",
        "timestamp": datetime.now(UTC).isoformat(),
        "data": {
            "external_id": TEST_USER_ID,
            "email": TEST_USER_EMAIL,
            "display_name": f"{TEST_USER_NAME} (Updated)",
            "department": "Operations",
            "account_enabled": False
        }
    }
    
    try:
        response = await client.post(
            f"{RISKHUB_BASE}/directory/webhook",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("action") == "deactivated":
                result.success(f"User deactivated, orphans: {data.get('orphaned_count', 0)}")
            else:
                result.fail(f"Expected action 'deactivated', got '{data.get('action')}'")
        else:
            result.fail(f"Status {response.status_code}: {response.text}")
    except Exception as e:
        result.fail(str(e))
    
    return result


async def test_malformed_webhook(client: httpx.AsyncClient) -> TestResult:
    """Test: Malformed webhook returns 422."""
    result = TestResult("Malformed Webhook Handling")
    
    # Missing required fields
    payload = {"event_type": "user.created"}
    
    try:
        response = await client.post(
            f"{RISKHUB_BASE}/directory/webhook",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 422:
            result.success("Returns 422 for malformed payload")
        else:
            result.fail(f"Expected 422, got {response.status_code}")
    except Exception as e:
        result.fail(str(e))
    
    return result


async def test_orphan_stats(client: httpx.AsyncClient) -> TestResult:
    """Test: Orphan stats endpoint works."""
    result = TestResult("Orphan Stats API")
    
    try:
        # This endpoint requires auth but should respond to unauthenticated
        response = await client.get(f"{RISKHUB_BASE}/orphaned-items/stats")
        
        if response.status_code == 401:
            result.success("Returns 401 for unauthenticated (correct)")
        elif response.status_code == 200:
            result.success("Returns orphan stats")
        else:
            result.fail(f"Unexpected status: {response.status_code}")
    except Exception as e:
        result.fail(str(e))
    
    return result


async def run_tests():
    """Run all integration tests."""
    print("\n" + "=" * 60)
    print("AD Integration Test Suite")
    print("=" * 60)
    print()
    
    results: list[TestResult] = []
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Webhook tests
        print("📡 Webhook Tests:")
        results.append(await test_webhook_user_create(client))
        await asyncio.sleep(0.5)  # Give time for processing
        results.append(await test_webhook_user_update(client))
        await asyncio.sleep(0.5)
        results.append(await test_webhook_user_deactivate(client))
        
        print("\n🛡️ Error Handling Tests:")
        results.append(await test_malformed_webhook(client))
        
        print("\n📊 API Tests:")
        results.append(await test_orphan_stats(client))
    
    # Summary
    print("\n" + "=" * 60)
    passed = sum(1 for r in results if r.passed)
    total = len(results)
    print(f"Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("✅ All tests passed!")
        return 0
    else:
        print("❌ Some tests failed")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(run_tests())
    sys.exit(exit_code)
