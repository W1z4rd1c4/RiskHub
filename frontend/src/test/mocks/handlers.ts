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
    { id: 2, process: 'Data Backup', category: 'Operations', net_score: 6, status: 'monitoring', is_priority: false },
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

// API handlers
export const handlers = [
    // Controls
    http.get('/api/v1/controls', () => {
        return HttpResponse.json(mockControls);
    }),

    http.get('/api/v1/controls/:id', ({ params }) => {
        const control = mockControls.find(c => c.id === Number(params.id));
        if (!control) return new HttpResponse(null, { status: 404 });
        return HttpResponse.json(control);
    }),

    // Risks
    http.get('/api/v1/risks', () => {
        return HttpResponse.json(mockRisks);
    }),

    http.get('/api/v1/risks/:id', ({ params }) => {
        const risk = mockRisks.find(r => r.id === Number(params.id));
        if (!risk) return new HttpResponse(null, { status: 404 });
        return HttpResponse.json(risk);
    }),

    // Dashboard
    http.get('/api/v1/dashboard/summary', () => {
        return HttpResponse.json(mockDashboard);
    }),

    // Executions
    http.get('/api/v1/executions', () => {
        return HttpResponse.json(mockExecutions);
    }),

    http.post('/api/v1/executions', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ id: 99, ...body, executed_at: new Date().toISOString() }, { status: 201 });
    }),
];
