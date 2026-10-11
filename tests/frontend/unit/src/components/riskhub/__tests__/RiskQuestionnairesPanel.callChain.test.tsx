import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { RiskQuestionnairesPanel } from '@/components/riskhub/RiskQuestionnairesPanel';
import { riskHubApi } from '@/services/riskHubApi';

// Unrelated list fixtures stay outside the retained batch-send call chain.
vi.mock('@/services/departmentApi', () => ({ departmentApi: { getDepartments: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/services/riskApi', () => ({
    riskApi: { getRisks: vi.fn().mockResolvedValue({
        items: [{ id: 41, risk_id_code: 'R-41', name: 'Retained caller risk', process: 'Operations',
            risk_type: 'operational', category: 'Delivery', description: '', gross_score: 9,
            gross_probability: 3, gross_impact: 3, net_score: 4, status: 'active', is_priority: false,
            department_id: 1, department_name: 'Operations', owner_id: 42, owner_name: 'Fixture owner' }],
        total: 1, offset: 0, limit: 50,
    }) },
}));
vi.mock('@/i18n/hooks', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/i18n/hooks')>()),
    useTranslation: () => ({ t: (key: string, options?: { name?: string }) => options?.name ? `${key}:${options.name}` : key }),
}));

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it('retains the real panel, hook and client chain to the mounted POST batch-send endpoint', async () => {
    // Observe the real client edge without replacing its implementation.
    const batchSend = vi.spyOn(riskHubApi, 'batchSendQuestionnaires');
    const posts: Array<{ method: string; path: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input), 'http://localhost').pathname;
        const method = init?.method ?? 'GET';
        if (path === '/api/v1/riskhub/capabilities' && method === 'GET') {
            return new Response(JSON.stringify({
                risk_types: { can_create: true }, departments: { can_create: true }, roles: { can_create: true },
                approval_scenarios: { can_update: true }, system_settings: { can_update: true },
                questionnaires: { can_batch_send: true },
            }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'POST') posts.push({ method, path, body: JSON.parse(String(init?.body)) });
        if (path !== '/api/v1/riskhub/questionnaires/batch-send' || method !== 'POST') {
            return new Response(JSON.stringify({ detail: 'unexpected test request' }), { status: 404 });
        }
        return new Response(JSON.stringify({ created_count: 1, skipped_no_owner: [], skipped_open_exists: [], errors: [] }), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><RiskQuestionnairesPanel /></QueryClientProvider>);
    await screen.findByText('Retained caller risk');
    fireEvent.click(screen.getByRole('checkbox', { name: 'riskhub.questionnaires.select_risk:Retained caller risk' }));
    fireEvent.click(screen.getByRole('button', { name: 'riskhub.questionnaires.send' }));
    expect(posts).toEqual([]);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'riskhub.questionnaires.send' }));
    await waitFor(() => expect(posts).toEqual([{
        method: 'POST', path: '/api/v1/riskhub/questionnaires/batch-send',
        body: { select_all: false, risk_ids: [41] },
    }]));
    expect(batchSend).toHaveBeenCalledExactlyOnceWith({ select_all: false, risk_ids: [41] });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    const outcome = (await screen.findByText('riskhub.questionnaires.results')).closest('[role="status"]');
    expect(outcome).not.toBeNull();
    const count = within(outcome as HTMLElement).getByText('riskhub.questionnaires.created');
    expect(count.nextElementSibling).toHaveTextContent('1');
    client.clear();
});
