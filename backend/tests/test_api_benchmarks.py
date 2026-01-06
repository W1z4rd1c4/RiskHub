"""
API Performance Benchmarks

This module provides benchmarks for core API endpoints to establish
baseline response times under controlled conditions.

Targets:
- Dashboard endpoints: < 500ms
- List endpoints: < 300ms  
- CRUD operations: < 200ms

Run with: pytest tests/test_api_benchmarks.py --benchmark-only
"""
import pytest
from httpx import AsyncClient

# Note: pytest-benchmark doesn't have native async support
# We use time-based measurements within async tests instead


@pytest.mark.asyncio
async def test_benchmark_risks_list(auth_client: AsyncClient, test_department, seed_risk_types):
    """Benchmark GET /api/v1/risks endpoint."""
    import time
    
    # Warm up - create a few risks
    for i in range(3):
        await auth_client.post("/api/v1/risks", json={
            "risk_id_code": f"R-BENCH-{i}",
            "name": f"Benchmark Risk {i}",
            "process": f"Benchmark Process {i}",
            "description": "Benchmark risk",
            "department_id": test_department.id,
            "risk_type": "operational",
            "category": "Benchmark",
            "gross_probability": 2,
            "gross_impact": 2,
            "net_probability": 1,
            "net_impact": 1,
            "status": "active",
        })
    
    # Benchmark
    times = []
    for _ in range(5):
        start = time.perf_counter()
        response = await auth_client.get("/api/v1/risks")
        elapsed = (time.perf_counter() - start) * 1000  # ms
        times.append(elapsed)
        assert response.status_code == 200
    
    avg_time = sum(times) / len(times)
    print(f"\nRisks List: avg={avg_time:.1f}ms, min={min(times):.1f}ms, max={max(times):.1f}ms")
    
    # Target: < 300ms for list endpoints
    assert avg_time < 300, f"Risks list too slow: {avg_time:.1f}ms > 300ms"


@pytest.mark.asyncio
async def test_benchmark_controls_list(auth_client: AsyncClient, test_department, seed_risk_types):
    """Benchmark GET /api/v1/controls endpoint."""
    import time
    
    times = []
    for _ in range(5):
        start = time.perf_counter()
        response = await auth_client.get("/api/v1/controls")
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)
        assert response.status_code == 200
    
    avg_time = sum(times) / len(times)
    print(f"\nControls List: avg={avg_time:.1f}ms, min={min(times):.1f}ms, max={max(times):.1f}ms")
    
    assert avg_time < 300, f"Controls list too slow: {avg_time:.1f}ms > 300ms"


@pytest.mark.asyncio
async def test_benchmark_kris_list(auth_client: AsyncClient):
    """Benchmark GET /api/v1/kris endpoint."""
    import time
    
    times = []
    for _ in range(5):
        start = time.perf_counter()
        response = await auth_client.get("/api/v1/kris")
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)
        assert response.status_code == 200
    
    avg_time = sum(times) / len(times)
    print(f"\nKRIs List: avg={avg_time:.1f}ms, min={min(times):.1f}ms, max={max(times):.1f}ms")
    
    assert avg_time < 300, f"KRIs list too slow: {avg_time:.1f}ms > 300ms"


@pytest.mark.asyncio
async def test_benchmark_dashboard_summary(auth_client: AsyncClient):
    """Benchmark GET /api/v1/dashboard/summary endpoint."""
    import time
    
    times = []
    for _ in range(5):
        start = time.perf_counter()
        response = await auth_client.get("/api/v1/dashboard/summary")
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)
        assert response.status_code == 200
    
    avg_time = sum(times) / len(times)
    print(f"\nDashboard Summary: avg={avg_time:.1f}ms, min={min(times):.1f}ms, max={max(times):.1f}ms")
    
    # Target: < 500ms for dashboard endpoints
    assert avg_time < 500, f"Dashboard summary too slow: {avg_time:.1f}ms > 500ms"


@pytest.mark.asyncio
async def test_benchmark_risk_crud(auth_client: AsyncClient, test_department, test_user, seed_risk_types):
    """Benchmark CRUD operations on risks."""
    import time
    
    # CREATE
    create_times = []
    risk_ids = []
    for i in range(3):
        start = time.perf_counter()
        response = await auth_client.post("/api/v1/risks", json={
            "risk_id_code": f"R-CRUD-{i}",
            "name": f"CRUD Test Risk {i}",
            "process": f"CRUD Test {i}",
            "description": "CRUD benchmark",
            "department_id": test_department.id,
            "risk_owner_id": test_user.id,
            "risk_type": "operational",
            "category": "Test",
            "gross_probability": 2,
            "gross_impact": 2,
            "net_probability": 1,
            "net_impact": 1,
            "status": "active",
        })
        elapsed = (time.perf_counter() - start) * 1000
        create_times.append(elapsed)
        assert response.status_code == 201
        risk_ids.append(response.json()["id"])
    
    avg_create = sum(create_times) / len(create_times)
    print(f"\nRisk CREATE: avg={avg_create:.1f}ms")
    
    # READ
    read_times = []
    for rid in risk_ids:
        start = time.perf_counter()
        response = await auth_client.get(f"/api/v1/risks/{rid}")
        elapsed = (time.perf_counter() - start) * 1000
        read_times.append(elapsed)
        assert response.status_code == 200
    
    avg_read = sum(read_times) / len(read_times)
    print(f"Risk READ: avg={avg_read:.1f}ms")
    
    # UPDATE
    update_times = []
    for rid in risk_ids:
        start = time.perf_counter()
        response = await auth_client.patch(f"/api/v1/risks/{rid}", json={
            "description": "Updated description"
        })
        elapsed = (time.perf_counter() - start) * 1000
        update_times.append(elapsed)
        assert response.status_code == 200
    
    avg_update = sum(update_times) / len(update_times)
    print(f"Risk UPDATE: avg={avg_update:.1f}ms")
    
    # Target: < 200ms for CRUD operations
    assert avg_create < 200, f"Risk CREATE too slow: {avg_create:.1f}ms > 200ms"
    assert avg_read < 200, f"Risk READ too slow: {avg_read:.1f}ms > 200ms"
    assert avg_update < 200, f"Risk UPDATE too slow: {avg_update:.1f}ms > 200ms"


@pytest.mark.asyncio
async def test_benchmark_departments_list(auth_client: AsyncClient):
    """Benchmark GET /api/v1/departments endpoint."""
    import time
    
    times = []
    for _ in range(5):
        start = time.perf_counter()
        response = await auth_client.get("/api/v1/departments")
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)
        assert response.status_code == 200
    
    avg_time = sum(times) / len(times)
    print(f"\nDepartments List: avg={avg_time:.1f}ms, min={min(times):.1f}ms, max={max(times):.1f}ms")
    
    assert avg_time < 300, f"Departments list too slow: {avg_time:.1f}ms > 300ms"
