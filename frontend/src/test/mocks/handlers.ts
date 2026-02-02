/**
 * MSW handlers for API mocking.
 */
import { http, HttpResponse } from 'msw';

// Mock data
export const mockControls = [
    { id: 1, name: 'Access Control Review', department_name: 'IT', frequency: 'monthly', risk_level: 3, status: 'active' },
    { id: 2, name: 'Financial Reconciliation', department_name: 'Finance', frequency: 'daily', risk_level: 4, status: 'active' },
];

export const mockRisks = [
    { id: 1, process: 'User Authentication', category: 'IT', net_score: 12, status: 'active', is_priority: true },
    { id: 2, process: 'Data Backup', category: 'Operations', net_score: 6, status: 'emerging', is_priority: false },
];

export const mockDashboard = {
    total_controls: 42,
    active_controls: 38,
    total_risks: 25,
    active_risks: 20,
    critical_risks: 3,
    high_risks: 7,
    medium_risks: 10,
    low_risks: 5,
};

export const mockExecutions = [
    { id: 1, control_id: 1, result: 'pass', executed_at: '2025-12-25T10:00:00Z', findings: 'No issues found' },
    { id: 2, control_id: 1, result: 'issues_found', executed_at: '2025-12-24T10:00:00Z', findings: 'Minor documentation gap' },
];

export const mockAuthUser = {
    id: 99,
    email: 'admin@test.local',
    name: 'Test Admin',
    role: 'admin',
    role_display_name: 'Administrator',
    permissions: ['*:*'],
    effective_permissions: ['*:*'],
    access_scope: 'global',
    scope_label: 'all',
};

let mockPreferences: { theme: 'light' | 'dark' | 'riskhub'; language: 'en' | 'cs' } = {
    theme: 'riskhub',
    language: 'en',
};

export const mockRiskHubRiskTypes = [
    {
        id: 1,
        code: 'operational',
        display_name: 'Operational',
        description: 'Operational risks',
        color: '#3b82f6',
        icon: null,
        sort_order: 1,
        is_active: true,
        is_system: true,
        risk_count: 0,
        created_at: '2025-12-25T10:00:00Z',
        updated_at: '2025-12-25T10:00:00Z',
    },
    {
        id: 2,
        code: 'strategic',
        display_name: 'Strategic',
        description: 'Strategic risks',
        color: '#8b5cf6',
        icon: null,
        sort_order: 2,
        is_active: true,
        is_system: true,
        risk_count: 0,
        created_at: '2025-12-25T10:00:00Z',
        updated_at: '2025-12-25T10:00:00Z',
    },
];

export const mockRiskHubConfig = {
    risk_thresholds: [
        {
            id: 1,
            key: 'critical_risk_min_net_score',
            value: '16',
            value_type: 'int',
            category: 'risk_thresholds',
            display_name: 'Critical Risk Min Net Score',
            description: null,
            min_value: 0,
            max_value: 100,
            is_editable: true,
            updated_at: '2025-12-25T10:00:00Z',
            updated_by_name: 'Test Admin',
        },
        {
            id: 2,
            key: 'high_risk_min_net_score',
            value: '10',
            value_type: 'int',
            category: 'risk_thresholds',
            display_name: 'High Risk Min Net Score',
            description: null,
            min_value: 0,
            max_value: 100,
            is_editable: true,
            updated_at: '2025-12-25T10:00:00Z',
            updated_by_name: 'Test Admin',
        },
        {
            id: 3,
            key: 'medium_risk_min_net_score',
            value: '5',
            value_type: 'int',
            category: 'risk_thresholds',
            display_name: 'Medium Risk Min Net Score',
            description: null,
            min_value: 0,
            max_value: 100,
            is_editable: true,
            updated_at: '2025-12-25T10:00:00Z',
            updated_by_name: 'Test Admin',
        },
    ],
};

// Public risk types (minimal fields for non-CRO access)
export const mockPublicRiskTypes = [
    {
        code: 'operational',
        display_name: 'Operational',
        color: '#3b82f6',
        icon: null,
        sort_order: 1,
    },
    {
        code: 'strategic',
        display_name: 'Strategic',
        color: '#8b5cf6',
        icon: null,
        sort_order: 2,
    },
];

export const mockDirectoryUsers = [
    {
        id: 1,
        external_id: 'dir-1001',
        user_principal_name: 'ava@directory.local',
        email: 'ava@directory.local',
        display_name: 'Ava Novak',
        department: 'IT',
        manager_external_id: 'dir-2001',
        account_enabled: true,
        user_id: 10,
        created_at: '2025-12-28T10:00:00Z',
        updated_at: '2025-12-28T10:10:00Z',
    },
    {
        id: 2,
        external_id: 'dir-1002',
        user_principal_name: 'luka@directory.local',
        email: 'luka@directory.local',
        display_name: 'Luka Dvorak',
        department: 'Finance',
        manager_external_id: null,
        account_enabled: false,
        user_id: null,
        created_at: '2025-12-28T10:05:00Z',
        updated_at: '2025-12-28T10:12:00Z',
    },
];

export const mockDirectoryPreview = {
    created_count: 1,
    updated_count: 1,
    deactivated_count: 0,
    error_count: 0,
    diffs: [
        {
            external_id: 'dir-1002',
            email: 'luka@directory.local',
            action: 'create',
            changes: {
                email: { old: null, new: 'luka@directory.local' },
                name: { old: null, new: 'Luka Dvorak' },
            },
        },
        {
            external_id: 'dir-1001',
            email: 'ava@directory.local',
            action: 'update',
            changes: {
                department: { old: 'Risk', new: 'IT' },
            },
        },
    ],
};

export const mockDirectorySyncHistory = [
    {
        id: 1,
        started_at: '2025-12-28T09:00:00Z',
        finished_at: '2025-12-28T09:00:10Z',
        status: 'success',
        created_count: 2,
        updated_count: 1,
        deactivated_count: 0,
        error_count: 0,
        errors: null,
        created_at: '2025-12-28T09:00:10Z',
    },
];

// API handlers
export const handlers = [
    // Auth
    http.get('*/api/v1/auth/me', () => {
        return HttpResponse.json(mockAuthUser);
    }),
    // Preferences
    http.get('*/api/v1/preferences', () => {
        return HttpResponse.json(mockPreferences);
    }),
    http.put('*/api/v1/preferences', async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Partial<typeof mockPreferences>;
        mockPreferences = { ...mockPreferences, ...body };
        return HttpResponse.json(mockPreferences);
    }),
    // Users
    http.get('*/api/v1/users/lookup', () => {
        return HttpResponse.json([]);
    }),
    // Controls
    http.get('*/api/v1/controls', () => {
        return HttpResponse.json(mockControls);
    }),

    http.get('*/api/v1/controls/:id', ({ params }) => {
        const control = mockControls.find(c => c.id === Number(params.id));
        if (!control) return new HttpResponse(null, { status: 404 });
        return HttpResponse.json(control);
    }),

    // Risks
    http.get('*/api/v1/risks', () => {
        return HttpResponse.json(mockRisks);
    }),

    http.get('*/api/v1/risks/:id', ({ params }) => {
        const risk = mockRisks.find(r => r.id === Number(params.id));
        if (!risk) return new HttpResponse(null, { status: 404 });
        return HttpResponse.json(risk);
    }),

    // Dashboard
    http.get('*/api/v1/dashboard/summary', () => {
        return HttpResponse.json(mockDashboard);
    }),

    // Executions
    http.get('*/api/v1/executions', () => {
        return HttpResponse.json(mockExecutions);
    }),

    http.post('*/api/v1/executions', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ id: 99, ...body, executed_at: new Date().toISOString() }, { status: 201 });
    }),

    // Risk Hub (used by hooks; keep tests offline)
    http.get('*/api/v1/riskhub/risk-types', () => {
        return HttpResponse.json(mockRiskHubRiskTypes);
    }),
    http.get('*/api/v1/riskhub/public-risk-types', () => {
        return HttpResponse.json(mockPublicRiskTypes);
    }),
    http.get('*/api/v1/riskhub/config', () => {
        return HttpResponse.json(mockRiskHubConfig);
    }),
    http.get('*/api/v1/riskhub/public-config/:key', ({ params }) => {
        const key = params.key as string;
        const allConfigs = mockRiskHubConfig.risk_thresholds;
        const config = allConfigs.find(c => c.key === key);
        if (!config) return new HttpResponse(null, { status: 404 });
        return HttpResponse.json({
            key: config.key,
            value: parseInt(config.value, 10),
            value_type: config.value_type,
        });
    }),

    // Directory emulator
    http.get('*/api/v1/directory/users', () => {
        return HttpResponse.json(mockDirectoryUsers);
    }),

    http.post('*/api/v1/directory/sync/preview', () => {
        return HttpResponse.json(mockDirectoryPreview);
    }),

    http.post('*/api/v1/directory/sync/apply', () => {
        return HttpResponse.json(mockDirectoryPreview);
    }),

    http.get('*/api/v1/directory/sync/history', () => {
        return HttpResponse.json(mockDirectorySyncHistory);
    }),
];
