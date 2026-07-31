"""RED contract tests for ticket #90 Department health metrics."""

from datetime import timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.db.seed import seed_ict_workbook_parameter_config
from app.models import (
    ApprovalScenario,
    Asset,
    Control,
    Department,
    Issue,
    KeyRiskIndicator,
    Permission,
    Process,
    ProcessVendorLink,
    Risk,
    Role,
    RolePermission,
    User,
    Vendor,
)
from app.models.global_config import clear_config_cache
from app.models.issue import IssueStatus
from app.models.risk import RiskStatus
from app.models.user import AccessScope


@pytest.mark.asyncio
async def test_department_health_secondary_counts_match_canonical_register_filters(
    client_factory,
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_platform_admin: User,
    test_user_cro: User,
):
    await seed_ict_workbook_parameter_config(db_session)
    clear_config_cache()
    department = Department(name="Health filter parity", code="HEALTH-PARITY")
    db_session.add(department)
    await db_session.flush()
    test_user_platform_admin.department_id = department.id
    now = utc_now()

    high_risk = Risk(
        risk_id_code="RISK-HEALTH-HIGH",
        name="High health Risk",
        process="Health parity",
        description="At the canonical high-band floor",
        category="Operational",
        department_id=department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        gross_probability=4,
        gross_impact=4,
        gross_score=16,
        net_probability=2,
        net_impact=4,
        net_score=8,
        status=RiskStatus.active.value,
    )
    critical_risk = Risk(
        risk_id_code="RISK-HEALTH-CRITICAL",
        name="Critical health Risk",
        process="Health parity",
        description="Critical Risk",
        category="Operational",
        department_id=department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        gross_probability=5,
        gross_impact=5,
        gross_score=25,
        net_probability=4,
        net_impact=4,
        net_score=16,
        status=RiskStatus.active.value,
    )
    emerging_critical_risk = Risk(
        risk_id_code="RISK-HEALTH-EMERGING-CRITICAL",
        name="Emerging critical health Risk",
        process="Health parity",
        description="Must not enter the default active-only Department metrics",
        category="Operational",
        department_id=department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        gross_probability=5,
        gross_impact=5,
        gross_score=25,
        net_probability=5,
        net_impact=5,
        net_score=25,
        status=RiskStatus.emerging.value,
    )
    attention_control = Control(
        name="Needs review Control",
        description="No execution inside the configured freshness window",
        department_id=department.id,
        control_owner_id=test_user_employee.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
        created_at=now - timedelta(days=366),
    )
    critical_process = Process(
        f_code="F-HEALTH-CRITICAL",
        l0_area="Operations",
        l1_process="Critical health Process",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=department.id,
        preliminary_criticality="critical",
        cif_override="no",
    )
    cif_process = Process(
        f_code="F-HEALTH-CIF",
        l0_area="Operations",
        l1_process="CIF health Process",
        process_owner_user_id=test_user_employee.id,
        owning_department_id=department.id,
        preliminary_criticality="low",
        cif_override="yes",
    )
    critical_asset = Asset(
        name="Critical health Asset",
        owning_department_id=department.id,
        business_owner_user_id=test_user_employee.id,
        ict_owner_user_id=test_user_employee.id,
        preliminary_criticality="critical",
    )
    legacy_asset = Asset(
        name="Legacy health Asset",
        owning_department_id=department.id,
        business_owner_user_id=test_user_employee.id,
        ict_owner_user_id=test_user_employee.id,
        preliminary_criticality="low",
        lifecycle_state="legacy",
    )
    critical_vendor = Vendor(
        name="Critical health Vendor",
        process="Operations",
        department_id=department.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="ict",
    )
    dora_vendor = Vendor(
        name="DORA health Vendor",
        process="Operations",
        department_id=department.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="ict",
        dora_relevant=True,
    )
    active_user = User(
        name="Active health User",
        email="active-health-user@test.com",
        department_id=department.id,
        role_id=test_user_employee.role_id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    inactive_user = User(
        name="Inactive health User",
        email="inactive-health-user@test.com",
        department_id=department.id,
        role_id=test_user_employee.role_id,
        is_active=False,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add_all(
        [
            high_risk,
            critical_risk,
            emerging_critical_risk,
            attention_control,
            critical_process,
            cif_process,
            critical_asset,
            legacy_asset,
            critical_vendor,
            dora_vendor,
            active_user,
            inactive_user,
        ]
    )
    await db_session.flush()
    db_session.add_all(
        [
            KeyRiskIndicator(
                risk_id=high_risk.id,
                metric_name="Breaching health KRI",
                description="Submitted current-period breach",
                current_value=101,
                lower_limit=0,
                upper_limit=100,
                unit="%",
                frequency="monthly",
                reporting_owner_id=test_user_employee.id,
                last_period_end=now.date(),
            ),
            KeyRiskIndicator(
                risk_id=high_risk.id,
                metric_name="Overdue health KRI",
                description="Missed required reporting period",
                current_value=50,
                lower_limit=0,
                upper_limit=100,
                unit="%",
                frequency="monthly",
                reporting_owner_id=test_user_employee.id,
                last_period_end=(now - timedelta(days=365)).date(),
            ),
            Issue(
                title="Open health Issue",
                severity="medium",
                status=IssueStatus.open,
                source_type="manual",
                department_id=department.id,
                owner_user_id=test_user_employee.id,
                due_at=now + timedelta(days=30),
            ),
            Issue(
                title="Overdue health Issue",
                severity="high",
                status=IssueStatus.in_progress,
                source_type="manual",
                department_id=department.id,
                owner_user_id=test_user_employee.id,
                due_at=now - timedelta(days=1),
            ),
            ProcessVendorLink(
                process_id=cif_process.id,
                vendor_id=critical_vendor.id,
            ),
        ]
    )
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        response = await client.get(f"/api/v1/departments/{department.id}")
        assert response.status_code == 200, response.text
        payload = response.json()

        async def canonical_total(
            path: str,
            params: dict[str, object],
        ) -> int:
            listed = await client.get(path, params=params)
            assert listed.status_code == 200, listed.text
            return int(listed.json()["total"])

        canonical_totals = {
            "risk_total": await canonical_total(
                "/api/v1/risks",
                {"department_id": department.id, "status": RiskStatus.active.value},
            ),
            "risk_high": await canonical_total(
                "/api/v1/risks",
                {
                    "department_id": department.id,
                    "net_band": "Vysoké",
                    "status": RiskStatus.active.value,
                },
            ),
            "risk_critical": await canonical_total(
                "/api/v1/risks",
                {
                    "department_id": department.id,
                    "net_band": "Kritické",
                    "status": RiskStatus.active.value,
                },
            ),
            "control_attention": await canonical_total(
                "/api/v1/controls",
                {
                    "department_id": department.id,
                    "monitoring_status": "needs_review",
                },
            ),
            "kri_breach": await canonical_total(
                "/api/v1/kris",
                {
                    "department_id": department.id,
                    "monitoring_status": "breach",
                },
            ),
            "kri_overdue": await canonical_total(
                "/api/v1/kris",
                {
                    "department_id": department.id,
                    "monitoring_status": "not_submitted",
                },
            ),
            "issue_open": await canonical_total(
                "/api/v1/issues",
                {"department_id": department.id, "status": "open"},
            ),
            "issue_overdue": await canonical_total(
                "/api/v1/issues",
                {"department_id": department.id, "overdue": True},
            ),
            "process_critical": await canonical_total(
                "/api/v1/processes",
                {"department_ids": department.id, "criticality": "critical"},
            ),
            "process_cif": await canonical_total(
                "/api/v1/processes",
                {"department_ids": department.id, "cif": True},
            ),
            "asset_critical": await canonical_total(
                "/api/v1/assets",
                {"department_ids": department.id, "criticality": "critical"},
            ),
            "asset_legacy": await canonical_total(
                "/api/v1/assets",
                {"department_ids": department.id, "legacy": True},
            ),
            "vendor_critical": await canonical_total(
                "/api/v1/vendors",
                {"department_id": department.id, "tier": "critical"},
            ),
            "vendor_dora": await canonical_total(
                "/api/v1/vendors",
                {"department_id": department.id, "dora_relevant": True},
            ),
        }
        roster_response = await client.get(
            "/api/v1/access/users/my-department",
            params={"department_id": department.id},
        )
        assert roster_response.status_code == 200, roster_response.text
        roster_ids = {row["id"] for row in roster_response.json()}
        assert test_user_platform_admin.id not in roster_ids
        canonical_totals["user_active"] = len(roster_ids)

    assert canonical_totals == {
        "risk_total": payload["risk_count"],
        "risk_high": payload["risk_distribution"]["high"],
        "risk_critical": payload["risk_distribution"]["critical"],
        "control_attention": payload["attention_control_count"],
        "kri_breach": payload["kri_monitoring_counts"]["breach"],
        "kri_overdue": payload["kri_monitoring_counts"]["not_submitted"],
        "issue_open": payload["open_issue_count"],
        "issue_overdue": payload["overdue_issue_count"],
        "process_critical": payload["critical_process_count"],
        "process_cif": payload["cif_process_count"],
        "asset_critical": payload["critical_asset_count"],
        "asset_legacy": payload["legacy_asset_count"],
        "vendor_critical": payload["critical_vendor_count"],
        "vendor_dora": payload["dora_vendor_count"],
        "user_active": payload["user_count"],
    } == {
        "risk_total": 2,
        **{
            metric: 1
            for metric in canonical_totals
            if metric != "risk_total"
        },
    }
    assert payload["high_risk_count"] == 2


@pytest.mark.asyncio
async def test_department_health_secondary_counts_are_null_without_domain_read_permissions(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
):
    department_read = Permission(resource="departments", action="read")
    role = Role(
        name="department_health_without_domain_reads",
        display_name="Department health without domain reads",
    )
    db_session.add_all([department_read, role])
    await db_session.flush()
    db_session.add(RolePermission(role_id=role.id, permission_id=department_read.id))
    caller = User(
        name="Department health shell reader",
        email="department-health-shell-reader@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(caller)
    await db_session.commit()

    async with client_factory(user=caller) as client:
        response = await client.get(f"/api/v1/departments/{test_department.id}")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["risk_distribution"] is None
    assert payload["kri_monitoring_counts"] is None
    for field in (
        "attention_control_count",
        "open_issue_count",
        "critical_process_count",
        "cif_process_count",
        "critical_asset_count",
        "legacy_asset_count",
        "critical_vendor_count",
        "dora_vendor_count",
    ):
        assert payload[field] is None


@pytest.mark.asyncio
async def test_department_critical_vendor_count_is_unavailable_when_canonical_tier_derivation_is_hidden(
    client_factory,
    db_session: AsyncSession,
):
    permissions = [
        Permission(resource=resource, action="read")
        for resource in (
            "departments",
            "vendors",
            "processes",
            "assets",
            "vendor_contracts",
        )
    ]
    role = Role(
        name="department_vendor_derivation_reader",
        display_name="Department Vendor derivation reader",
    )
    department = Department(name="Scoped Vendor health", code="SCOPED-VENDOR-HEALTH")
    db_session.add_all([*permissions, role, department])
    await db_session.flush()
    db_session.add_all(
        [
            RolePermission(role_id=role.id, permission_id=permission.id)
            for permission in permissions
        ]
    )
    caller = User(
        name="Scoped Vendor health reader",
        email="scoped-vendor-health-reader@test.com",
        department_id=department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(caller)
    await db_session.flush()
    db_session.add(
        Vendor(
            name="Scoped DORA Vendor",
            process="Operations",
            department_id=department.id,
            outsourcing_owner_user_id=caller.id,
            vendor_type="ict",
            dora_relevant=True,
        )
    )
    await db_session.commit()

    async with client_factory(user=caller) as client:
        vendor_response = await client.get(
            "/api/v1/vendors",
            params={"department_id": department.id},
        )
        detail_response = await client.get(f"/api/v1/departments/{department.id}")

    assert vendor_response.status_code == 200, vendor_response.text
    assert vendor_response.json()["total"] == 1
    assert vendor_response.json()["items"][0]["derived"] is None
    assert detail_response.status_code == 200, detail_response.text
    payload = detail_response.json()
    assert payload["vendor_count"] == 1
    assert payload["dora_vendor_count"] == 1
    assert payload["critical_vendor_count"] is None


@pytest.mark.asyncio
async def test_department_health_secondary_counts_exclude_rowless_pending_creations(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
    test_user_risk_manager: User,
):
    del test_user_risk_manager
    test_user_cro.department_id = test_department.id
    db_session.add_all(
        [
            ApprovalScenario(
                key="protected_asset_edit",
                display_name="Protected Asset mutations",
                description="Independent approval for protected Asset mutations",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
            ApprovalScenario(
                key="protected_vendor_edit",
                display_name="Protected Vendor mutations",
                description="Independent approval for protected Vendor mutations",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
        ]
    )
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        pending_asset = await client.post(
            "/api/v1/assets",
            json={
                "name": "Pending critical Department Asset",
                "business_owner_user_id": test_user_cro.id,
                "ict_owner_user_id": test_user_cro.id,
                "owning_department_id": test_department.id,
                "preliminary_criticality": "critical",
                "request_reason": "Verify operational health exclusion",
            },
        )
        pending_vendor = await client.post(
            "/api/v1/vendors",
            json={
                "name": "Pending DORA Department Vendor",
                "process": "Operations",
                "outsourcing_owner_user_id": test_user_cro.id,
                "department_id": test_department.id,
                "replaceability": "not_substitutable",
                "dora_relevant": True,
                "request_reason": "Verify operational health exclusion",
            },
        )
        detail = await client.get(f"/api/v1/departments/{test_department.id}")

    assert pending_asset.status_code == 202, pending_asset.text
    assert pending_vendor.status_code == 202, pending_vendor.text
    assert detail.status_code == 200, detail.text
    payload = detail.json()
    assert payload["critical_asset_count"] == 0
    assert payload["legacy_asset_count"] == 0
    assert payload["critical_vendor_count"] == 0
    assert payload["dora_vendor_count"] == 0
