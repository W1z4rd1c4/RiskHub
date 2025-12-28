"""
Tests for Execution API endpoints.
"""
import pytest
from httpx import AsyncClient

from app.models import Control, Department, User


@pytest.mark.asyncio
async def test_create_execution(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test logging a new control execution."""
    # Create a control first
    control_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Execution Test Control",
            "description": "Control for execution test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 3,
            "status": "active",
        },
    )
    control_id = control_response.json()["id"]
    
    # Log an execution
    response = await auth_client.post(
        "/api/v1/executions",
        json={
            "control_id": control_id,
            "result": "pass",
            "findings": "Control executed successfully with no issues",
            "evidence_reference": "DOC-2025-001",
        },
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["control_id"] == control_id
    assert data["result"] == "pass"
    assert data["findings"] == "Control executed successfully with no issues"


@pytest.mark.asyncio
async def test_list_executions(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test listing executions."""
    # Create a control and execution first
    control_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "List Execution Control",
            "description": "Control for list execution test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "automatic",
            "frequency": "daily",
            "risk_level": 2,
            "status": "active",
        },
    )
    control_id = control_response.json()["id"]
    
    await auth_client.post(
        "/api/v1/executions",
        json={
            "control_id": control_id,
            "result": "fail",
            "findings": "Issues found during execution",
        },
    )
    
    response = await auth_client.get("/api/v1/executions")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_filter_executions_by_result(auth_client: AsyncClient, test_user: User, test_department: Department):
    """Test filtering executions by result."""
    # Create a control and execution
    control_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Filter Execution Control",
            "description": "Control for filter execution test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "weekly",
            "risk_level": 4,
            "status": "active",
        },
    )
    control_id = control_response.json()["id"]
    
    await auth_client.post(
        "/api/v1/executions",
        json={
            "control_id": control_id,
            "result": "issues_found",
            "findings": "Minor issues detected",
        },
    )
    
    response = await auth_client.get("/api/v1/executions?result=issues_found")
    
    assert response.status_code == 200
    data = response.json()
    for execution in data:
        assert execution["result"] == "issues_found"
