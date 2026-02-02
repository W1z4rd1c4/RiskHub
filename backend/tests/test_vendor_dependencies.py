import pytest

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Permission, Risk, Role, RolePermission, User, Vendor
from app.models.vendor_service import VendorService, VendorDependency
from app.models.user import AccessScope
from app.models.risk import RiskStatus


@pytest.mark.asyncio
async def test_vendor_dependencies_disallow_self_relationship(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    vendor = Vendor(
        name="Acme ICT",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)

    resp = await auth_client.post(
        f"/api/v1/vendors/{vendor.id}/relationships",
        json={"related_vendor_id": vendor.id, "relationship_type": "subcontractor"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_vendor_dependency_relationship_tree_is_cycle_safe_and_depth_limited(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    vendor_a = Vendor(
        name="Vendor A",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    vendor_b = Vendor(
        name="Vendor B",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add_all([vendor_a, vendor_b])
    await db_session.commit()
    await db_session.refresh(vendor_a)
    await db_session.refresh(vendor_b)

    resp = await auth_client.post(
        f"/api/v1/vendors/{vendor_a.id}/relationships",
        json={"related_vendor_id": vendor_b.id, "relationship_type": "subcontractor"},
    )
    assert resp.status_code == 201

    resp = await auth_client.post(
        f"/api/v1/vendors/{vendor_b.id}/relationships",
        json={"related_vendor_id": vendor_a.id, "relationship_type": "subcontractor"},
    )
    assert resp.status_code == 201

    resp = await auth_client.get(f"/api/v1/vendors/{vendor_a.id}/dependencies")
    assert resp.status_code == 200
    data = resp.json()
    assert data["vendor_id"] == vendor_a.id

    tree = data["relationship_tree"]
    assert tree["vendor_id"] == vendor_a.id
    assert len(tree["children"]) == 1
    assert tree["children"][0]["vendor_id"] == vendor_b.id

    # Depth is capped to 2, and cycle does not recurse indefinitely.
    assert len(tree["children"][0]["children"]) <= 1
    if tree["children"][0]["children"]:
        assert tree["children"][0]["children"][0]["vendor_id"] == vendor_a.id
        assert tree["children"][0]["children"][0]["children"] == []


@pytest.mark.asyncio
async def test_vendor_concentration_flags_include_multi_department_dependency(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    dept2 = Department(name="Second Department", code="DEPT2", description="Second dept")
    db_session.add(dept2)
    await db_session.commit()
    await db_session.refresh(dept2)

    vendor = Vendor(
        name="Critical Vendor",
        process="Ops",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="outsourcing",
        risk_score_1_5=4,
        supports_important_core_insurance_function=True,
        dora_relevant=True,
        is_significant_vendor=False,
        replaceability="hard",
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)

    service = VendorService(vendor_id=vendor.id, service_name="Core processing")
    db_session.add(service)
    await db_session.commit()
    await db_session.refresh(service)

    db_session.add_all(
        [
            VendorDependency(vendor_service_id=service.id, department_id=test_department.id, supported_function_name="Claims"),
            VendorDependency(vendor_service_id=service.id, department_id=dept2.id, supported_function_name="Payments"),
        ]
    )
    await db_session.commit()

    resp = await auth_client.get(f"/api/v1/vendors/{vendor.id}/dependencies")
    assert resp.status_code == 200
    concentration = resp.json()["concentration"]
    assert 0 <= concentration["score"] <= 10
    keys = {f["key"] for f in concentration["flags"]}
    assert "hard_to_replace" in keys
    assert "multi_department_dependency" in keys


@pytest.mark.asyncio
async def test_vendor_dependencies_redacts_cross_scope_names(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    dept2 = Department(name="Second Department", code="DEPT2", description="Second dept")
    db_session.add(dept2)

    role = Role(name="vendor_reader", display_name="Vendor Reader", description="Vendors:read only")
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    perm = Permission(resource="vendors", action="read", description="Read vendors")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)

    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()

    scoped_user = User(
        name="Dept User",
        email="dept-user@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(scoped_user)
    await db_session.commit()
    await db_session.refresh(scoped_user)

    risk_in_scope = Risk(
        risk_id_code="R-IN-001",
        name="In-scope Risk",
        process="Test Process",
        description="Risk in dept 1",
        category="Test Category",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    risk_out_scope = Risk(
        risk_id_code="R-OUT-001",
        name="Out-of-scope Risk",
        process="Test Process",
        description="Risk in dept 2",
        category="Test Category",
        department_id=dept2.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add_all([risk_in_scope, risk_out_scope])

    vendor = Vendor(
        name="Scoped Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=scoped_user.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)
    await db_session.refresh(dept2)
    await db_session.refresh(risk_in_scope)
    await db_session.refresh(risk_out_scope)

    service = VendorService(vendor_id=vendor.id, service_name="Core processing")
    db_session.add(service)
    await db_session.commit()
    await db_session.refresh(service)

    db_session.add_all(
        [
            VendorDependency(
                vendor_service_id=service.id,
                department_id=test_department.id,
                risk_id=risk_in_scope.id,
                supported_function_name="Claims",
            ),
            VendorDependency(
                vendor_service_id=service.id,
                department_id=dept2.id,
                risk_id=risk_out_scope.id,
                supported_function_name="Payments",
            ),
        ]
    )
    await db_session.commit()
    vendor_id = vendor.id
    scoped_user_id = scoped_user.id
    db_session.expire_all()

    resp = await client.get(
        f"/api/v1/vendors/{vendor_id}/dependencies",
        headers={"X-Mock-User-Id": str(scoped_user_id)},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["services"], body
    deps = body["services"][0]["dependencies"]
    assert deps, body

    in_scope = next(d for d in deps if d["supported_function_name"] == "Claims")
    assert in_scope["risk_id"] == risk_in_scope.id
    assert in_scope["department_id"] == test_department.id
    assert in_scope["department_name"] == test_department.name
    assert in_scope["risk_name"] == risk_in_scope.name

    out_scope = next(d for d in deps if d["supported_function_name"] == "Payments")
    assert out_scope["risk_id"] == risk_out_scope.id
    assert out_scope["department_id"] == dept2.id
    assert out_scope["department_name"] is None
    assert out_scope["risk_name"] is None


@pytest.mark.asyncio
async def test_vendor_dependency_create_rejects_cross_scope_risk(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    dept2 = Department(name="Second Department", code="DEPT2", description="Second dept")
    db_session.add(dept2)

    role = Role(name="vendor_reader", display_name="Vendor Reader", description="Vendors:read only")
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    perm = Permission(resource="vendors", action="read", description="Read vendors")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)

    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()

    scoped_user = User(
        name="Dept User",
        email="dept-user@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(scoped_user)
    await db_session.commit()
    await db_session.refresh(scoped_user)

    risk_out_scope = Risk(
        risk_id_code="R-OUT-001",
        name="Out-of-scope Risk",
        process="Test Process",
        description="Risk in dept 2",
        category="Test Category",
        department_id=dept2.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(risk_out_scope)

    vendor = Vendor(
        name="Scoped Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=scoped_user.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)
    await db_session.refresh(dept2)
    await db_session.refresh(risk_out_scope)

    service = VendorService(vendor_id=vendor.id, service_name="Core processing")
    db_session.add(service)
    await db_session.commit()
    await db_session.refresh(service)

    resp = await client.post(
        f"/api/v1/vendor-services/{service.id}/dependencies",
        headers={"X-Mock-User-Id": str(scoped_user.id)},
        json={
            "risk_id": risk_out_scope.id,
            "department_id": dept2.id,
            "supported_function_name": "Payments",
        },
    )
    assert resp.status_code == 404
