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
    { id: 1, control_id: 1, result: 'passed', executed_at: '2025-12-25T10:00:00Z', findings: 'No issues found' },
    { id: 2, control_id: 1, result: 'warning', executed_at: '2025-12-24T10:00:00Z', findings: 'Minor documentation gap' },
];

export const mockAuthUser = {
    id: 99,
    email: 'admin@test.local',
    name: 'Test Admin',
    role: 'admin',
    role_display_name: 'Administrator',
    permissions: ['users:*', 'departments:read'],
    effective_permissions: ['users:*', 'departments:read'],
    access_scope: 'global',
    scope_label: 'all',
};

export const mockDemoPersonas = [
    {
        section: 'privileged',
        name: 'System Admin',
        email: 'admin@riskhub.local',
        role_key: 'auth:login_demo.roles.administrator',
        color: 'rose',
    },
    {
        section: 'privileged',
        name: 'Anna Kowalski',
        email: 'cro@riskhub.local',
        role_key: 'auth:login_demo.roles.chief_risk_officer',
        color: 'purple',
    },
    {
        section: 'privileged',
        name: 'Petra Svobodová',
        email: 'risk.manager@riskhub.local',
        role_key: 'auth:login_demo.roles.risk_manager',
        color: 'violet',
    },
    {
        section: 'department_heads',
        name: 'Eva Králová',
        email: 'ops.head@riskhub.local',
        role_key: 'auth:login_demo.roles.department_head',
        dept_key: 'auth:login_demo.departments.operations',
        color: 'amber',
    },
    {
        section: 'department_heads',
        name: 'Martin Procházka',
        email: 'fin.head@riskhub.local',
        role_key: 'auth:login_demo.roles.department_head',
        dept_key: 'auth:login_demo.departments.finance',
        color: 'emerald',
    },
    {
        section: 'department_heads',
        name: 'Tomáš Novotný',
        email: 'it.head@riskhub.local',
        role_key: 'auth:login_demo.roles.department_head',
        dept_key: 'auth:login_demo.departments.it',
        color: 'sky',
    },
    {
        section: 'employees',
        name: 'Jana Horáková',
        email: 'ops.analyst@riskhub.local',
        role_key: 'auth:login_demo.roles.control_owner',
        dept_key: 'auth:login_demo.departments.operations',
        color: 'amber',
    },
    {
        section: 'employees',
        name: 'Lukáš Dvořák',
        email: 'fin.analyst@riskhub.local',
        role_key: 'auth:login_demo.roles.control_owner',
        dept_key: 'auth:login_demo.departments.finance',
        color: 'emerald',
    },
    {
        section: 'employees',
        name: 'Barbora Němcová',
        email: 'it.analyst@riskhub.local',
        role_key: 'auth:login_demo.roles.control_owner',
        dept_key: 'auth:login_demo.departments.it',
        color: 'sky',
    },
] as const;

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

// API handlers
export const handlers = [
    // Auth
    http.get('*/api/v1/auth/config', () => {
        return HttpResponse.json({
            auth_mode: 'hybrid_dev',
            demo_login_enabled: true,
            password_login_enabled: true,
            demo_personas: mockDemoPersonas,
            sso: {
                enabled: false,
                provider: 'entra',
                tenant_id: null,
                client_id: null,
                authority: null,
                scopes: ['openid', 'profile', 'email'],
            },
            sso_error: null,
        });
    }),
    http.post('*/api/v1/auth/sso/exchange', () => {
        return HttpResponse.json({
            access_token: 'test-sso-token',
            token_type: 'bearer',
            user: mockAuthUser,
        });
    }),
    http.post('*/api/v1/auth/demo-login', () => {
        return HttpResponse.json({
            access_token: 'test-demo-token',
            token_type: 'bearer',
            user: mockAuthUser,
        });
    }),
    http.post('*/api/v1/auth/demo-login/:userId', () => {
        return HttpResponse.json({
            access_token: 'test-demo-token',
            token_type: 'bearer',
            user: mockAuthUser,
        });
    }),
    http.get('*/api/v1/auth/csrf', () => {
        document.cookie = 'riskhub_csrf_token=test-csrf-token; path=/';
        return new HttpResponse(null, { status: 204 });
    }),
    http.post('*/api/v1/auth/refresh', () => {
        return HttpResponse.json(
            { detail: 'Authentication required' },
            { status: 401 },
        );
    }),
    http.get('*/api/v1/auth/me', () => {
        return HttpResponse.json(mockAuthUser);
    }),

    // Approvals (used by pending-approvals hooks; keep tests offline)
    http.get('*/api/v1/approvals', ({ request }) => {
        const url = new URL(request.url);
        const skip = Number(url.searchParams.get('skip') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 100);
        return HttpResponse.json({
            items: [],
            total: 0,
            skip,
            limit,
        });
    }),
    http.get('*/api/v1/approvals/pending/count', () => {
        return HttpResponse.json({ count: 0 });
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
        return HttpResponse.json({
            items: mockExecutions,
            total: mockExecutions.length,
            skip: 0,
            limit: mockExecutions.length,
        });
    }),

    http.post('*/api/v1/executions', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ id: 99, ...body, executed_at: new Date().toISOString(), created_at: new Date().toISOString() }, { status: 201 });
    }),

    http.get('*/api/v1/controls/:id/executions', ({ params }) => {
        const controlId = Number(params.id);
        return HttpResponse.json(mockExecutions.filter((execution) => execution.control_id === controlId));
    }),

    http.post('*/api/v1/controls/:id/executions', async ({ request, params }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
            id: 100,
            ...body,
            control_id: Number(params.id),
            executed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
        }, { status: 201 });
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
];
