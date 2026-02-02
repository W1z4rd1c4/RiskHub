"""
Tests for Risk API endpoints.
"""
import pytest
from httpx import AsyncClient

from app.models import Department, User


@pytest.mark.asyncio
async def test_create_risk(auth_client: AsyncClient, test_user: User, test_department: Department, seed_risk_types):
    """Test creating a new risk."""
    response = await auth_client.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "R-101",
            "name": "Test Risk R-101",
            "process": "Test Process",
            "description": "A test risk for verification",
            "department_id": test_department.id,
            "risk_owner_id": test_user.id,
            "risk_type": "operational",
            "category": "Compliance",
            "gross_probability": 3,
            "gross_impact": 4,
            "net_probability": 2,
            "net_impact": 3,
            "status": "active",
        },
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["process"] == "Test Process"
    assert data["gross_score"] == 12  # 3 * 4
    assert data["net_score"] == 6  # 2 * 3


@pytest.mark.asyncio
async def test_list_risks(auth_client: AsyncClient, test_user: User, test_department: Department, seed_risk_types):
    """Test listing risks with pagination."""
    # Create a risk first
    await auth_client.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "R-102",
            "name": "List Test Risk R-102",
            "process": "List Test Risk",
            "description": "Risk for list test",
            "department_id": test_department.id,
            "risk_owner_id": test_user.id,
            "risk_type": "strategic",
            "category": "Financial",
            "gross_probability": 2,
            "gross_impact": 5,
            "net_probability": 1,
            "net_impact": 4,
            "status": "active",
        },
    )
    
    response = await auth_client.get("/api/v1/risks")
    
    assert response.status_code == 200
    data = response.json()
    items = data.get("items", [])
    assert isinstance(items, list)
    assert len(items) >= 1


@pytest.mark.asyncio
async def test_get_risk(auth_client: AsyncClient, test_user: User, test_department: Department, seed_risk_types):
    """Test retrieving a single risk."""
    # Create a risk first
    create_response = await auth_client.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "R-103",
            "name": "Get Test Risk R-103",
            "process": "Get Test Risk",
            "description": "Risk for get test",
            "department_id": test_department.id,
            "risk_owner_id": test_user.id,
            "risk_type": "operational",
            "category": "IT",
            "gross_probability": 4,
            "gross_impact": 3,
            "net_probability": 3,
            "net_impact": 2,
            "status": "active",
        },
    )
    risk_id = create_response.json()["id"]
    
    # Get the risk
    response = await auth_client.get(f"/api/v1/risks/{risk_id}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == risk_id
    assert data["process"] == "Get Test Risk"


@pytest.mark.asyncio
async def test_update_risk(auth_client: AsyncClient, test_user: User, test_department: Department, seed_risk_types):
    """Test updating a risk."""
    # Create a risk first
    create_response = await auth_client.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "R-104",
            "name": "Update Test Risk R-104",
            "process": "Update Test Risk",
            "description": "Risk for update test",
            "department_id": test_department.id,
            "risk_owner_id": test_user.id,
            "risk_type": "operational",
            "category": "Operations",
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )
    risk_id = create_response.json()["id"]
    
    # Update the risk
    response = await auth_client.patch(
        f"/api/v1/risks/{risk_id}",
        json={
            "process": "Updated Risk Process",
            "net_probability": 1,
            "net_impact": 1,
        },
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["process"] == "Updated Risk Process"
    assert data["net_score"] == 1  # 1 * 1


@pytest.mark.asyncio
async def test_filter_risks_by_status(auth_client: AsyncClient, test_user: User, test_department: Department, seed_risk_types):
    """Test filtering risks by status."""
    # Create an active risk
    await auth_client.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "R-105",
            "name": "Active Risk R-105",
            "process": "Active Risk",
            "description": "An active risk",
            "department_id": test_department.id,
            "risk_owner_id": test_user.id,
            "risk_type": "operational",
            "category": "Test",
            "gross_probability": 2,
            "gross_impact": 2,
            "net_probability": 1,
            "net_impact": 1,
            "status": "active",
        },
    )
    
    response = await auth_client.get("/api/v1/risks?status=active")
    
    assert response.status_code == 200
    data = response.json().get("items", [])
    assert len(data) >= 1
    for risk in data:
        assert risk["status"] == "active"


@pytest.mark.asyncio
async def test_risk_not_found(auth_client: AsyncClient, test_user: User):
    """Test getting a non-existent risk returns 404."""
    response = await auth_client.get("/api/v1/risks/99999")
    
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_generate_risk_id_code_r100_plus(db_session, test_department, test_user, seed_risk_types):
    """
    Regression test: generate_risk_id_code should correctly handle R100+ codes.
    
    The old implementation used limit(20) which could miss the true max if >20 codes
    existed. This test creates R98, R99, R100, R101 and verifies the generator returns R102.
    """
    from app.api.v1.endpoints.risks import generate_risk_id_code
    from app.models import Risk
    
    # Create risks with high-numbered codes for "Test" process (prefix = "TEST-R")
    for num in [98, 99, 100, 101]:
        risk = Risk(
            risk_id_code=f"TEST-R{num:02d}" if num < 100 else f"TEST-R{num}",
            name=f"Test Risk {num}",
            process="Test",
            description=f"Risk number {num}",
            department_id=test_department.id,
            owner_id=test_user.id,
            risk_type="operational",
            category="Test",
            gross_probability=2,
            gross_impact=2,
            gross_score=4,
            net_probability=1,
            net_impact=1,
            net_score=1,
            status="active",
        )
        db_session.add(risk)
    await db_session.commit()
    
    # Generate next ID - should be TEST-R102, not TEST-R100 (lexicographic bug)
    next_code = await generate_risk_id_code(db_session, process="Test")
    
    assert next_code == "TEST-R102", f"Expected TEST-R102 but got {next_code}"
