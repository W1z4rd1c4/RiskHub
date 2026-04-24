import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authApi } from '@/services/authApi';
import { controlApi } from '@/services/controlApi';
import { __setCsrfTokenForTests, clearCsrfToken } from '@/services/csrfToken';
import { departmentApi } from '@/services/departmentApi';
import { executionApi } from '@/services/executionApi';
import { kriApi } from '@/services/kriApi';
import { riskApi } from '@/services/riskApi';
import { userApi } from '@/services/userApi';
import { userDirectoryApi } from '@/services/userDirectoryApi';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function responseUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') {
        return input;
    }
    if (input instanceof URL) {
        return input.toString();
    }
    return input.url;
}

function buildNullableExecution(overrides: Record<string, unknown> = {}) {
    return {
        id: 91,
        control_id: 42,
        executed_by_id: 7,
        executed_at: '2026-04-07T10:00:00Z',
        result: 'passed',
        findings: null,
        evidence_reference: null,
        notes: null,
        next_scheduled: null,
        created_at: '2026-04-07T10:00:00Z',
        executed_by: null,
        ...overrides,
    };
}

function buildNullableKri(overrides: Record<string, unknown> = {}) {
    return {
        id: 9,
        risk_id: 12,
        metric_name: 'Patch SLA',
        description: 'Tracks patch compliance window.',
        current_value: 92,
        lower_limit: 80,
        upper_limit: 100,
        unit: '%',
        breach_status: 'within',
        last_updated: '2026-04-07T10:00:00Z',
        created_at: '2026-04-07T10:00:00Z',
        frequency: 'monthly',
        reporting_owner_id: null,
        reporting_owner_name: null,
        last_period_end: null,
        last_reported_at: null,
        risk_category: null,
        risk_process: null,
        risk_name: null,
        risk_description: null,
        risk_type: null,
        risk_id_code: null,
        risk_owner_name: null,
        risk_department_name: null,
        department_name: null,
        monitoring_status: 'new',
        monitoring_status_reason: 'no_submission_history_within_window',
        is_submitted_for_required_period: false,
        required_period_end: '2026-03-31',
        required_due_date: '2026-04-10',
        days_overdue: 0,
        warning_upper_margin_ratio: 0.1,
        linked_vendors: [],
        ...overrides,
    };
}

describe('response schema nullability alignment', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        clearCsrfToken();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        clearCsrfToken();
    });

    it('accepts disabled auth config responses with null Entra fields', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/auth/config')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse({
                auth_mode: 'hybrid_dev',
                demo_login_enabled: true,
                password_login_enabled: true,
                sso: {
                    enabled: false,
                    provider: 'entra',
                    tenant_id: null,
                    client_id: null,
                    authority: null,
                    scopes: ['openid', 'profile', 'email'],
                },
                sso_error: null,
                demo_personas: [],
            }));
        });

        await expect(authApi.getAuthConfig()).resolves.toMatchObject({
            auth_mode: 'hybrid_dev',
            sso: {
                tenant_id: null,
                client_id: null,
                authority: null,
            },
        });
    });

    it('accepts current-user responses with null department ownership', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/auth/me')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse({
                id: 1,
                email: 'admin@riskhub.local',
                name: 'System Admin',
                role: 'administrator',
                role_display_name: 'Administrator',
                department_id: null,
                department_name: null,
                permissions: [],
                effective_permissions: [],
                access_scope: 'global',
                scope_label: 'Global',
            }));
        });

        await expect(authApi.getCurrentUser('access-token')).resolves.toMatchObject({
            department_id: null,
            department_name: null,
        });
    });

    it('accepts refresh responses with null department ownership', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (url.endsWith('/api/v1/auth/csrf')) {
                __setCsrfTokenForTests('refresh-csrf-token');
                return Promise.resolve(new Response(null, { status: 204 }));
            }
            if (!url.endsWith('/api/v1/auth/refresh')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse({
                access_token: 'refreshed-token',
                token_type: 'bearer',
                user: {
                    id: 1,
                    email: 'admin@riskhub.local',
                    name: 'System Admin',
                    role: 'administrator',
                    role_display_name: 'Administrator',
                    department_id: null,
                    department_name: null,
                    permissions: [],
                    effective_permissions: [],
                    access_scope: 'global',
                    scope_label: 'Global',
                },
            }));
        });

        await expect(authApi.refresh()).resolves.toMatchObject({
            access_token: 'refreshed-token',
            user: {
                department_id: null,
                department_name: null,
            },
        });
    });

    it('accepts user lookup responses with null optional relationship fields', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/users/lookup')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse([
                {
                    id: 7,
                    name: 'Global Reviewer',
                    email: 'reviewer@riskhub.test',
                    role_name: null,
                    department_id: null,
                    department_name: null,
                    manager_id: null,
                },
            ]));
        });

        await expect(userApi.listVisibleUsers()).resolves.toEqual([
            {
                id: 7,
                name: 'Global Reviewer',
                email: 'reviewer@riskhub.test',
                role_name: null,
                department_id: null,
                department_name: null,
                manager_id: null,
            },
        ]);
    });

    it('accepts user directory responses with null role and department fields', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/users/directory')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse({
                items: [
                    {
                        id: 11,
                        name: 'Directory User',
                        email: 'directory.user@riskhub.test',
                        role_name: null,
                        role_display_name: null,
                        department_id: null,
                        department_name: null,
                    },
                ],
                available_roles: [],
                total: 1,
                skip: 0,
                limit: 50,
            }));
        });

        await expect(userDirectoryApi.listDirectoryUsers()).resolves.toMatchObject({
            items: [
                {
                    role_name: null,
                    role_display_name: null,
                    department_id: null,
                    department_name: null,
                },
            ],
        });
    });

    it('accepts control detail responses with null metadata and relationships', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/controls/42')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse({
                id: 42,
                name: 'Quarterly Access Review',
                description: 'Review user access quarterly.',
                data_source: null,
                methodology_reference: null,
                control_form: 'manual',
                process_owner_position: null,
                control_owner_id: null,
                executor_position: null,
                frequency: 'quarterly',
                risk_level: 3,
                output_description: null,
                report_recipient: null,
                documentation_location: null,
                department_id: null,
                status: 'draft',
                created_by_id: null,
                updated_by_id: null,
                created_at: '2026-04-07T10:00:00Z',
                updated_at: '2026-04-07T10:00:00Z',
                control_owner: null,
                department: null,
            }));
        });

        await expect(controlApi.getControl(42)).resolves.toMatchObject({
            data_source: null,
            control_owner_id: null,
            department_id: null,
            control_owner: null,
            department: null,
        });
    });

    it('accepts control execution history responses with nullable execution fields', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/controls/42/executions')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse([buildNullableExecution()]));
        });

        await expect(controlApi.getExecutions(42)).resolves.toEqual([buildNullableExecution()]);
    });

    it('accepts logged control execution responses with nullable execution fields', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/controls/42/executions')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse(buildNullableExecution(), 201));
        });

        await expect(controlApi.logExecution(42, { result: 'passed' })).resolves.toEqual(buildNullableExecution());
    });

    it('accepts global execution log responses with nullable execution fields', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.includes('/api/v1/executions')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse({
                items: [
                    buildNullableExecution({
                        control: { id: 42, name: 'Quarterly Access Review' },
                        control_name: 'Quarterly Access Review',
                        executed_by_name: 'Unknown',
                        control_owner_name: 'Unassigned',
                        linked_risks: [],
                    }),
                ],
                total: 1,
                skip: 0,
                limit: 50,
            }));
        });

        await expect(executionApi.getExecutions()).resolves.toMatchObject({
            items: [
                {
                    findings: null,
                    evidence_reference: null,
                    notes: null,
                    next_scheduled: null,
                    executed_by: null,
                },
            ],
        });
    });

    it('accepts KRI detail responses with null ownership and risk metadata', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/kris/9')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse(buildNullableKri()));
        });

        await expect(kriApi.getKRI(9)).resolves.toMatchObject({
            reporting_owner_id: null,
            reporting_owner_name: null,
            last_period_end: null,
            last_reported_at: null,
            risk_category: null,
            risk_process: null,
            risk_name: null,
            risk_description: null,
            risk_type: null,
            risk_id_code: null,
            risk_owner_name: null,
            risk_department_name: null,
            department_name: null,
        });
    });

    it('accepts KRI list responses with null ownership and risk metadata', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.includes('/api/v1/kris')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse({
                items: [buildNullableKri()],
                total: 1,
                offset: 0,
                limit: 50,
            }));
        });

        await expect(kriApi.getKRIs()).resolves.toMatchObject({
            offset: 0,
            limit: 50,
            items: [
                {
                    reporting_owner_id: null,
                    reporting_owner_name: null,
                    last_period_end: null,
                    last_reported_at: null,
                    risk_category: null,
                    risk_process: null,
                    risk_name: null,
                    risk_description: null,
                    risk_type: null,
                    risk_id_code: null,
                    risk_owner_name: null,
                    risk_department_name: null,
                    department_name: null,
                },
            ],
        });
    });

    it('accepts KRI history responses with null recorded-by fields', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/kris/9/history')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse({
                items: [
                    {
                        id: 3,
                        kri_id: 9,
                        period_start: '2026-03-01',
                        period_end: '2026-03-31',
                        recorded_at: '2026-04-01T10:00:00Z',
                        value: 88,
                        lower_limit: 80,
                        upper_limit: 100,
                        unit: '%',
                        breach_status: 'within',
                        recorded_by_id: null,
                        recorded_by_name: null,
                    },
                ],
                total: 1,
                page: 1,
                size: 50,
            }));
        });

        await expect(kriApi.getHistory(9)).resolves.toMatchObject({
            offset: 0,
            limit: 50,
            items: [
                {
                    recorded_by_id: null,
                    recorded_by_name: null,
                },
            ],
        });
    });

    it.each([
        ['KRI page-only pagination', () => kriApi.getKRIs({ page: 2 }), '/api/v1/kris', { offset: '20', limit: null }],
        ['KRI page-size pagination', () => kriApi.getKRIs({ page: 2, size: 50 }), '/api/v1/kris', { offset: '50', limit: '50' }],
        ['KRI history page-only pagination', () => kriApi.getHistory(9, { page: 2 }), '/api/v1/kris/9/history', { offset: '20', limit: null }],
        ['KRI history page-limit pagination', () => kriApi.getHistory(9, { page: 2, limit: 10 }), '/api/v1/kris/9/history', { offset: '10', limit: '10' }],
        ['KRI explicit offset precedence', () => kriApi.getKRIs({ offset: 75, page: 2, size: 50 }), '/api/v1/kris', { offset: '75', limit: '50' }],
    ])('emits canonical offsets for %s', async (_label, request, expectedPath, expectedParams) => {
        let requestedUrl: URL | null = null;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            requestedUrl = new URL(responseUrl(input));
            if (!requestedUrl.pathname.endsWith(expectedPath)) {
                throw new Error(`Unexpected fetch call: ${requestedUrl.toString()}`);
            }
            if (requestedUrl.pathname.endsWith('/history')) {
                return Promise.resolve(jsonResponse({
                    items: [],
                    total: 0,
                    offset: Number(expectedParams.offset),
                    limit: Number(expectedParams.limit ?? 20),
                }));
            }
            return Promise.resolve(jsonResponse({
                items: [],
                total: 0,
                offset: Number(expectedParams.offset),
                limit: Number(expectedParams.limit ?? 20),
            }));
        });

        await request();

        expect(requestedUrl?.searchParams.get('offset')).toBe(expectedParams.offset);
        expect(requestedUrl?.searchParams.get('limit')).toBe(expectedParams.limit);
    });

    it('accepts overdue KRI responses with null reporting-owner fields', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/kris/overdue')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse([
                {
                    kri_id: 9,
                    metric_name: 'Patch SLA',
                    frequency: 'monthly',
                    period_end: '2026-03-31',
                    due_date: '2026-04-10',
                    days_overdue: 3,
                    reporting_owner_id: null,
                    reporting_owner_name: null,
                    risk_id: 12,
                },
            ]));
        });

        await expect(kriApi.getOverdue()).resolves.toEqual([
            expect.objectContaining({
                reporting_owner_id: null,
                reporting_owner_name: null,
            }),
        ]);
    });

    it('accepts due-soon KRI responses with null reporting-owner fields', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/kris/due-soon')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse([
                {
                    kri_id: 9,
                    metric_name: 'Patch SLA',
                    frequency: 'monthly',
                    period_end: '2026-03-31',
                    due_date: '2026-04-10',
                    days_until_due: 2,
                    reporting_owner_id: null,
                    reporting_owner_name: null,
                    risk_id: 12,
                },
            ]));
        });

        await expect(kriApi.getDueSoon()).resolves.toEqual([
            expect.objectContaining({
                reporting_owner_id: null,
                reporting_owner_name: null,
            }),
        ]);
    });

    it('accepts risk detail responses with null metadata and relationships', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/risks/12')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse({
                id: 12,
                risk_id_code: 'R-12',
                name: 'Privilege Escalation',
                process: 'Access Management',
                subprocess: null,
                risk_type: 'operational',
                category: null,
                description: 'Risk of improper privilege growth.',
                department_id: null,
                owner_id: null,
                gross_probability: 3,
                gross_impact: 4,
                gross_score: 12,
                net_probability: 2,
                net_impact: 3,
                net_score: 6,
                status: 'active',
                is_priority: false,
                created_at: '2026-04-07T10:00:00Z',
                updated_at: '2026-04-07T10:00:00Z',
                owner: null,
                department: null,
            }));
        });

        await expect(riskApi.getRisk(12)).resolves.toMatchObject({
            subprocess: null,
            category: null,
            department_id: null,
            owner_id: null,
            owner: null,
            department: null,
        });
    });

    it('accepts control-linked risk responses with null link notes', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/controls/42/risks')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse([
                {
                    id: 15,
                    control_id: 42,
                    risk_id: 12,
                    effectiveness: 'medium',
                    notes: null,
                    created_at: '2026-04-07T10:00:00Z',
                },
            ]));
        });

        await expect(controlApi.getLinkedRisks(42)).resolves.toEqual([
            expect.objectContaining({
                notes: null,
            }),
        ]);
    });

    it('accepts risk-linked control responses with null link notes', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/risks/12/controls')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse([
                {
                    id: 15,
                    control_id: 42,
                    risk_id: 12,
                    effectiveness: 'medium',
                    notes: null,
                    created_at: '2026-04-07T10:00:00Z',
                },
            ]));
        });

        await expect(riskApi.getLinkedControls(12)).resolves.toEqual([
            expect.objectContaining({
                notes: null,
            }),
        ]);
    });

    it('accepts department detail responses with a null description', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = responseUrl(input);
            if (!url.endsWith('/api/v1/departments/5')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return Promise.resolve(jsonResponse({
                id: 5,
                name: 'Shared Services',
                code: 'SHARED',
                description: null,
                created_at: '2026-04-07T10:00:00Z',
                updated_at: '2026-04-07T10:00:00Z',
                user_count: 2,
                risk_count: 0,
                control_count: 1,
                kri_count: 0,
                kri_monitoring_counts: {},
                risk_distribution: {
                    low: 0,
                    medium: 0,
                    high: 0,
                    critical: 0,
                },
                risk_by_status: {},
                control_stats: {
                    total: 1,
                    active: 1,
                    inactive: 0,
                    by_form: {},
                    by_frequency: {},
                },
                recent_executions: [],
            }));
        });

        await expect(departmentApi.getDepartment(5)).resolves.toMatchObject({
            description: null,
        });
    });
});
