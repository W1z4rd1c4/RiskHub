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
    OPS_HEAD_CROSS_DEPT_EDITABLE: {
        code: 'E2E-RISK-002',
        name: 'Pricing Model Calibration Error',
        owner_email: 'ops.head@riskhub.local',
        department: 'Risk Management',
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

/** Dedicated Vendor of the ICT Register vendor-domain suites (issues #44/#45). */
export const E2E_ICT_VENDOR = {
    registration_id: 'E2E-VREG-ICT-001',
    name: 'E2E-VENDOR-ICT Core Hosting Provider',
    owner_email: 'risk.manager@riskhub.local',
    department: 'Operations',
    identifier_type: 'LEI',
    identifier_value: 'E2E00LEI00000000ICT1',
    replaceability: 'Velmi obtížně nahraditelný',
    status: 'active',
} as const;

/** Contract matrix of E2E_ICT_VENDOR — TWO mains on purpose (DQ-39 owns uniqueness). */
export const E2E_VENDOR_CONTRACTS = {
    MAIN_ROI: {
        contract_reference: 'E2E-CTR-001',
        internal_contract_number: 'TAS-E2E-0001',
        arrangement_type: 'Rámcové (master)',
        main_contract: 'Ano',
        roi_scope: 'Ano',
        status: 'active',
    },
    SECOND_MAIN: {
        contract_reference: 'E2E-CTR-002',
        internal_contract_number: 'SAP-E2E-0002',
        arrangement_type: 'Samostatné',
        main_contract: 'Ano',
        roi_scope: 'Ne',
        status: 'active',
    },
    ARCHIVED: {
        contract_reference: 'E2E-CTR-ARCH',
        arrangement_type: 'Navazující',
        main_contract: 'Ne',
        status: 'archived',
    },
} as const;

/** Sub-outsourcing chain on E2E-CTR-001: two directs + one deeper link (rank 3). */
export const E2E_SUB_OUTSOURCING = {
    DIRECT_PRIMARY: {
        sub_provider_name: 'E2E-SUB-001 Primary DC Operator',
        contract_reference: 'E2E-CTR-001',
        country: 'CZ',
        ict_service_code: 'S07',
        status: 'active',
    },
    DIRECT_SECONDARY: {
        sub_provider_name: 'E2E-SUB-002 Network Backbone',
        contract_reference: 'E2E-CTR-001',
        country: 'DE',
        ict_service_code: 'S11',
        status: 'active',
    },
    /** Hangs under DIRECT_PRIMARY — the indented rank-3 row of the chain render. */
    RANK_3: {
        sub_provider_name: 'E2E-SUB-003 Offsite Backup Facility',
        contract_reference: 'E2E-CTR-001',
        predecessor_name: 'E2E-SUB-001 Primary DC Operator',
        country: 'SK',
        ict_service_code: 'S09',
        status: 'active',
    },
} as const;

export const E2E_PROCESSES = {
    /** Carries the seeded primary designation on E2E-ASSET-001. */
    CLAIMS_INTAKE: {
        l0_area: 'E2E Claims',
        l1_process: 'E2E-PROC-001 Claims Intake',
        mtpd_hours: 24,
        preliminary_criticality: 'Vysoká',
        status: 'active',
    },
    POLICY_ADMIN: {
        l0_area: 'E2E Policy Admin',
        l1_process: 'E2E-PROC-002 Policy Administration',
        preliminary_criticality: 'Střední',
        status: 'active',
    },
    REGULATORY_REPORTING: {
        l0_area: 'E2E Finance',
        l1_process: 'E2E-PROC-003 Regulatory Reporting',
        preliminary_criticality: 'Kritická',
        status: 'active',
    },
    PORTAL_SUPPORT: {
        l0_area: 'E2E Customer Service',
        l1_process: 'E2E-PROC-004 Customer Portal Support',
        status: 'active',
    },
    ARCHIVED: {
        l0_area: 'E2E Legacy',
        l1_process: 'E2E-PROC-ARCH Batch Print Distribution',
        status: 'archived',
    },
} as const;

export const E2E_ASSETS = {
    /** Linked to PROC-001 (primary) and PROC-002; depends on ASSET-002 and ASSET-003. */
    CORE_CLAIMS_SYSTEM: {
        name: 'E2E-ASSET-001 Core Claims System',
        asset_type: 'Aplikace',
        preliminary_criticality: 'Vysoká',
        status: 'active',
    },
    CLAIMS_DATABASE: {
        name: 'E2E-ASSET-002 Claims Database',
        asset_type: 'Databáze',
        preliminary_criticality: 'Kritická',
        status: 'active',
    },
    /** Dedicated target of the UI process-link management test (links reset in-test). */
    INTEGRATION_BUS: {
        name: 'E2E-ASSET-003 Integration Message Bus',
        asset_type: 'Infrastruktura',
        status: 'active',
    },
    /** Dedicated target of the UI asset-link management test (links reset in-test). */
    REPORTING_WAREHOUSE: {
        name: 'E2E-ASSET-004 Reporting Warehouse',
        asset_type: 'Datové úložiště',
        status: 'active',
    },
    ARCHIVED: {
        name: 'E2E-ASSET-ARCH Fax Gateway',
        asset_type: 'Hardware',
        status: 'archived',
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

export const E2E_SENSITIVE_APPROVALS = {
    RISK_OWNER_CHANGE: {
        reason: 'E2E-SENSITIVE: Change risk owner from Ops Head to Finance Head',
        resourceType: 'risk',
        action: 'edit',
        status: 'pending',
        field: 'owner_id',
        oldValue: 4,
        newValue: 5,
    },
    RISK_DEPARTMENT_CHANGE: {
        reason: 'E2E-SENSITIVE: Move risk from Operations to Finance department',
        resourceType: 'risk',
        action: 'edit',
        status: 'pending',
        field: 'department_id',
        oldValue: 1,
        newValue: 2,
    },
    RISK_CATEGORY_CHANGE: {
        reason: 'E2E-SENSITIVE: Change risk category from Operational to Strategic',
        resourceType: 'risk',
        action: 'edit',
        status: 'pending',
        field: 'category',
        oldValue: 'Operational',
        newValue: 'Strategic',
    },
    RISK_PRIORITY_DOWNGRADE: {
        reason: 'E2E-SENSITIVE: Downgrade priority risk to non-priority',
        resourceType: 'risk',
        action: 'edit',
        status: 'pending',
        field: 'is_priority',
        oldValue: true,
        newValue: false,
    },
    CONTROL_OWNER_CHANGE: {
        reason: 'E2E-SENSITIVE: Change control owner to different department',
        resourceType: 'control',
        action: 'edit',
        status: 'pending',
        field: 'control_owner_id',
        oldValue: 6,
        newValue: 7,
    },
    CONTROL_DEPARTMENT_CHANGE: {
        reason: 'E2E-SENSITIVE: Move control from IT to Operations department',
        resourceType: 'control',
        action: 'edit',
        status: 'pending',
        field: 'department_id',
        oldValue: 3,
        newValue: 1,
    },
    RISK_OWNER_CLEAR: {
        reason: 'E2E-SENSITIVE: Clear owner (set to NULL)',
        resourceType: 'risk',
        action: 'edit',
        status: 'pending',
        field: 'owner_id',
        oldValue: 4,
        newValue: null,
    },
} as const;

export const E2E_REQUIRED_FIXTURES = {
    risks: [
        E2E_RISKS.CROSS_DEPT_FIN_OWNS_OPS.code,
        E2E_RISKS.OPS_HEAD_CROSS_DEPT_EDITABLE.code,
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
        E2E_ICT_VENDOR.registration_id,
    ],
    processes: [
        E2E_PROCESSES.CLAIMS_INTAKE.l1_process,
        E2E_PROCESSES.ARCHIVED.l1_process,
    ],
    assets: [
        E2E_ASSETS.CORE_CLAIMS_SYSTEM.name,
        E2E_ASSETS.ARCHIVED.name,
    ],
} as const;
