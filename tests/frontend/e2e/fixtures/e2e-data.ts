/**
 * Deterministic E2E dataset constants.
 * These identifiers must stay aligned with backend/scripts/seed_e2e_*.py.
 */

export const E2E_RISKS = {
    CROSS_DEPT_FIN_OWNS_OPS: {
        code: 'XDEPT-001',
        name: 'E2E-XDEPT-FIN-OPS-RISK Cross-Department Finance-Ops Risk',
        owner_email: 'fin.head@riskhub.local',
        department: 'Operations',
        status: 'active',
    },
    CROSS_DEPT_IT_OWNS_FIN: {
        code: 'XDEPT-002',
        name: 'E2E-XDEPT-IT-FIN-RISK Cross-Department IT-Finance Risk',
        owner_email: 'it.head@riskhub.local',
        department: 'Finance',
        status: 'active',
    },
    PRIORITY_PRIVILEGED_APPROVAL: {
        code: 'E2E-IT-001',
        name: 'Ransomware Attack Disruption',
        owner_email: 'it.head@riskhub.local',
        department: 'IT',
        status: 'active',
    },
    PENDING_DELETE_APPROVAL: {
        code: 'E2E-UW-003',
        name: 'Property Damage Accumulation',
        owner_email: 'ops.analyst@riskhub.local',
        department: 'Operations',
        status: 'active',
    },
    ARCHIVE_ACTIVE_PAIR: {
        code: 'E2E-ARCH-RISK-ACTIVE',
        name: 'E2E-ARCH-RISK Active Risk Pair',
        owner_email: 'risk.manager@riskhub.local',
        department: 'Risk Management',
        status: 'active',
    },
    ARCHIVE_RESTORE_TARGET: {
        code: 'E2E-ARCH-RISK-ARCHIVED',
        name: 'E2E-ARCH-RISK Archived Risk Pair',
        owner_email: 'risk.manager@riskhub.local',
        department: 'Risk Management',
        status: 'archived',
    },
} as const;

export const E2E_CONTROLS = {
    CROSS_DEPT_OPS_OWNS_IT: {
        name: 'E2E-XDEPT-OPS-IT-CTRL IT Control Owned by Ops',
        owner_email: 'ops.analyst@riskhub.local',
        department: 'IT',
        status: 'active',
    },
    CROSS_DEPT_IT_OWNS_OPS: {
        name: 'E2E-XDEPT-IT-OPS-CTRL Ops Control Owned by IT',
        owner_email: 'it.analyst@riskhub.local',
        department: 'Operations',
        status: 'active',
    },
    PENDING_DELETE_APPROVAL: {
        name: 'E2E-CTRL-003 Property Accumulation Check',
        owner_email: 'ops.head@riskhub.local',
        department: 'Operations',
        status: 'active',
    },
    ARCHIVE_ACTIVE_PAIR: {
        name: 'E2E-ARCH-CTRL Active Control Pair',
        owner_email: 'risk.manager@riskhub.local',
        department: 'Risk Management',
        status: 'active',
    },
    ARCHIVE_RESTORE_TARGET: {
        name: 'E2E-ARCH-CTRL Archived Control Pair',
        owner_email: 'risk.manager@riskhub.local',
        department: 'Risk Management',
        status: 'archived',
    },
} as const;

export const E2E_KRIS = {
    CROSS_DEPT_FIN_REPORTS_IT: {
        metric_name: 'E2E-XDEPT-FIN-IT-KRI IT KRI Reported by Finance',
        reporting_owner_email: 'fin.analyst@riskhub.local',
        status: 'active',
    },
    ARCHIVE_ACTIVE_PAIR: {
        metric_name: 'E2E-ARCH-KRI Active Pair',
        reporting_owner_email: 'risk.manager@riskhub.local',
        status: 'active',
    },
    ARCHIVE_RESTORE_TARGET: {
        metric_name: 'E2E-ARCH-KRI Archived Pair',
        reporting_owner_email: 'risk.manager@riskhub.local',
        status: 'archived',
    },
} as const;

export const E2E_VENDORS = {
    ACTIVE_PRIMARY: {
        registration_id: 'E2E-VREG-001',
        name: 'E2E-VENDOR-001 Claims Cloud Platform',
        owner_email: 'it.head@riskhub.local',
        status: 'active',
        vendor_type: 'ict',
    },
    ACTIVE_SECONDARY: {
        registration_id: 'E2E-VREG-002',
        name: 'E2E-VENDOR-002 AML Screening Service',
        owner_email: 'risk.manager@riskhub.local',
        status: 'active',
        vendor_type: 'outsourcing',
    },
    INACTIVE_RESTORE_TARGET: {
        registration_id: 'E2E-VREG-004',
        name: 'E2E-VENDOR-004 Travel Assistance Partner',
        owner_email: 'ops.head@riskhub.local',
        status: 'inactive',
        vendor_type: 'partner',
    },
} as const;

export const E2E_APPROVALS = {
    PENDING_RISK_DELETE: {
        reason: 'E2E test: Standard risk deletion by employee - awaiting primary approval',
        resource_name: 'Property Damage Accumulation',
        action: 'delete',
        status: 'pending',
    },
    PENDING_PRIORITY_DELETE: {
        reason: 'E2E test: Priority risk deletion requires privileged approval',
        resource_name: 'Claims Reserve Inadequacy',
        action: 'delete',
        status: 'pending',
    },
    PENDING_PRIVILEGED_EDIT: {
        reason: 'E2E test: Priority risk edit - primary approved, awaiting privileged',
        resource_name: 'Ransomware Attack Disruption',
        action: 'edit',
        status: 'pending_privileged',
    },
    PENDING_CONTROL_DELETE: {
        reason: 'E2E test: Control archive by non-privileged user',
        resource_name: 'E2E-CTRL-003 Property Accumulation Check',
        action: 'delete',
        status: 'pending',
    },
} as const;

export const E2E_REQUIRED_FIXTURES = {
    risks: [
        E2E_RISKS.CROSS_DEPT_FIN_OWNS_OPS.code,
        E2E_RISKS.ARCHIVE_RESTORE_TARGET.code,
    ],
    controls: [
        E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name,
        E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name,
    ],
    kris: [
        E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name,
        E2E_KRIS.ARCHIVE_RESTORE_TARGET.metric_name,
    ],
    vendors: [
        E2E_VENDORS.ACTIVE_PRIMARY.registration_id,
        E2E_VENDORS.INACTIVE_RESTORE_TARGET.registration_id,
    ],
} as const;
