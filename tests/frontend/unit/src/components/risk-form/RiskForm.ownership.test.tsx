import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskForm } from '@/components/RiskForm';
import type { Risk } from '@/types/risk';
import { createTestQueryClient } from '@test/queryClient';
import { renderWithQueryClient as render } from '@test/render';
import { server } from '@test/mocks/server';

const alice = { id: 7, name: 'Alice Owner', email: 'alice@example.com', role_name: 'employee', department_id: 1 };
const bob = { id: 8, name: 'Bob Manager', email: 'bob@example.com', role_name: 'manager', department_id: 1 };
const existing = { id: 999, name: 'Existing Owner', email: 'existing@example.com' };
const risk = {
    id: 17, risk_id_code: 'RISK-017', name: 'Existing risk', process: 'Claims', category: 'Operational',
    description: 'Existing description', risk_type: 'operational', owner_id: existing.id, owner: existing,
    department_id: 1, gross_probability: 3, gross_impact: 3, gross_score: 9, net_probability: 2,
    net_impact: 2, net_score: 4, status: 'active', is_archived: false, is_priority: false,
    created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
} as Risk;

function openOwnership(data = risk) {
    const router = createMemoryRouter([{ path: '/', element: <RiskForm initialData={data} isEdit onSuccess={() => undefined} /> }]);
    render(<QueryClientProvider client={createTestQueryClient()}><RouterProvider router={router} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Details & Owner' }));
}

describe('Risk owner assignment search', () => {
    beforeEach(() => {
        server.use(
            http.get('*/api/v1/lookups/risk-filters', () => HttpResponse.json({ processes: [], categories: [], subprocesses_by_process: {} })),
            http.get('*/api/v1/users/lookup/risk-owners', () => HttpResponse.json([alice, bob])),
            http.get('*/api/v1/departments', () => HttpResponse.json([{
                id: 1, name: 'Operations', code: 'OPS', user_count: 0, risk_count: 0,
                high_risk_count: 0, control_count: 0, kri_count: 0, breaching_kri_count: 0, total_net_score: 0,
            }])),
        );
    });

    it('keeps the edit identity and submitted assignment when All, one-match roles and text filters change', async () => {
        const update = vi.fn();
        server.use(http.patch('*/api/v1/risks/17', async ({ request }) => {
            update(await request.json());
            return HttpResponse.json(risk);
        }));
        const user = userEvent.setup();
        openOwnership();
        expect(screen.getByText('Existing Owner')).toBeVisible();
        await user.click(await screen.findByRole('button', { name: 'Manager', exact: true }));
        expect(screen.getByRole('button', { name: 'Manager', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await user.click(screen.getByRole('button', { name: 'All', exact: true }));
        await user.type(screen.getByRole('textbox', { name: /^Risk Owner/ }), 'Alice');
        await user.keyboard('{Enter}');
        expect(update).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Clear owner Existing Owner' })).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Risk Assessment' }));
        await user.click(screen.getByTestId('risk-form-submit-button'));
        await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 999, department_id: 1 })));
    });

    it('finds a beyond-200 owner through bounded server search and supports keyboard selection and clear focus', async () => {
        const requests: URL[] = [];
        const population = Array.from({ length: 205 }, (_, i) => ({ ...alice, id: i + 1, name: `Owner ${i + 1}` }));
        population[204] = { ...alice, id: 205, name: 'Unique Remote Owner' };
        server.use(http.get('*/api/v1/users/lookup/risk-owners', ({ request }) => {
            const url = new URL(request.url);
            requests.push(url);
            const q = url.searchParams.get('q') ?? '';
            return HttpResponse.json(population.filter((u) => u.name.includes(q)).slice(0, Number(url.searchParams.get('limit'))));
        }));
        const user = userEvent.setup();
        openOwnership();
        expect(await screen.findByText(/Showing up to 50/)).toBeVisible();
        await user.type(screen.getByRole('textbox', { name: /^Risk Owner/ }), 'Unique Remote');
        const candidate = await screen.findByRole('button', { name: /Unique Remote Owner\s*Employee/ });
        candidate.focus();
        await user.keyboard('{Enter}');
        expect(screen.getByRole('button', { name: 'Clear owner Unique Remote Owner' })).toBeVisible();
        expect(requests.at(-1)?.searchParams.get('q')).toBe('Unique Remote');
        expect(requests.every((url) => Number(url.searchParams.get('limit')) <= 50)).toBe(true);
        expect(requests.at(-1)?.searchParams.get('department_id')).toBe('1');
        await user.click(screen.getByRole('button', { name: 'Clear owner Unique Remote Owner' }));
        expect(screen.getByRole('textbox', { name: /^Risk Owner/ })).toHaveFocus();
        expect(screen.queryByRole('button', { name: /Clear owner/ })).not.toBeInTheDocument();
        await user.click(candidate);
        expect(screen.getByRole('button', { name: 'Clear owner Unique Remote Owner' })).toBeVisible();
    });

    it('shows the selected owner’s Department and preserves it when explicitly clearing only the owner', async () => {
        const user = userEvent.setup();
        openOwnership({ ...risk, department_id: null, owner_id: null, owner: null });
        await user.click(await screen.findByRole('button', { name: /Alice Owner\s*Employee/ }));
        expect(screen.getByRole('combobox', { name: /^Department/ })).toHaveTextContent('Operations (OPS)');
        expect(screen.getByRole('textbox', { name: /^Risk Owner/ })).toHaveFocus();
        await user.click(screen.getByRole('button', { name: 'Clear owner Alice Owner' }));
        expect(screen.getByRole('combobox', { name: /^Department/ })).toHaveTextContent('Operations (OPS)');
        await user.click(screen.getByTestId('risk-form-next-button'));
        const search = screen.getByRole('textbox', { name: /^Risk Owner/ });
        expect(search).toHaveAttribute('aria-invalid', 'true');
        expect(search.getAttribute('aria-describedby')?.split(' ').some((id) => document.getElementById(id)?.textContent?.includes('Risk Owner is required'))).toBe(true);
    });

    it('communicates required owner selection without requiring a query or accepting query text as an assignment', async () => {
        const user = userEvent.setup();
        openOwnership({ ...risk, owner_id: null, owner: null });
        const search = screen.getByRole('textbox', { name: 'Risk Owner (required selection)' });
        expect(search).not.toHaveAttribute('aria-required');
        expect(search).toHaveAccessibleDescription(/Selecting a person is required; typing a search does not assign an owner/);
        await user.type(search, 'Alice');
        const candidate = await screen.findByRole('button', { name: /Alice Owner\s*Employee/ });
        await user.click(screen.getByTestId('risk-form-next-button'));
        expect(search).toBeVisible();
        expect(search).toHaveAttribute('aria-invalid', 'true');
        expect(search).toHaveAccessibleDescription(/Risk Owner is required/);
        expect(screen.queryByRole('button', { name: /Clear owner/ })).not.toBeInTheDocument();
        await user.click(candidate);
        await user.click(screen.getByTestId('risk-form-next-button'));
        expect(screen.getByRole('heading', { name: /Gross Score/ })).toBeVisible();
    });

    it('distinguishes role-hidden matches from a genuinely empty server search', async () => {
        server.use(http.get('*/api/v1/users/lookup/risk-owners', ({ request }) => {
            const query = new URL(request.url).searchParams.get('q');
            return HttpResponse.json(query === 'Alice' ? [alice] : query === 'Nobody' ? [] : [alice, bob]);
        }));
        const user = userEvent.setup();
        openOwnership();
        await user.click(await screen.findByRole('button', { name: 'Manager', exact: true }));
        const search = screen.getByRole('textbox', { name: /^Risk Owner/ });
        await user.type(search, 'Alice');
        expect(await screen.findByText('No matching owners in this result set. Refine the search or choose All roles.')).toBeVisible();
        expect(screen.queryByText('No users found')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Clear owner Existing Owner' })).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'All', exact: true }));
        expect(screen.getByRole('button', { name: /Alice Owner\s*Employee/ })).toBeVisible();
        await user.clear(search);
        await user.type(search, 'Nobody');
        expect(await screen.findByText('No users found')).toBeVisible();
        expect(screen.queryByText('No matching owners in this result set. Refine the search or choose All roles.')).not.toBeInTheDocument();
    });

    it('distinguishes failed, loading and no-match results and retries without losing the owner', async () => {
        let fail = true;
        server.use(http.get('*/api/v1/users/lookup/risk-owners', () => fail
            ? HttpResponse.json({ detail: 'Unavailable' }, { status: 503 }) : HttpResponse.json([])));
        const user = userEvent.setup();
        openOwnership();
        expect(screen.getByRole('status')).toHaveTextContent('Searching owners');
        expect(await screen.findByRole('alert')).toHaveTextContent('Owner search failed');
        expect(screen.getByRole('textbox', { name: /^Risk Owner/ })).toHaveAccessibleDescription(/Owner search failed/);
        expect(screen.queryByText('No users found')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Clear owner Existing Owner' })).toBeVisible();
        const retry = screen.getByRole('button', { name: 'Retry' });
        // GAP-D-05: a styled secondary Button, not the undefined `.btn-secondary` class.
        expect(retry).toHaveClass('bg-secondary', 'text-secondary-foreground');
        expect(retry).not.toHaveClass('btn-secondary');
        fail = false;
        await user.click(retry);
        expect(screen.getByRole('textbox', { name: /^Risk Owner/ })).toHaveFocus();
        expect(await screen.findByText('No users found')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Clear owner Existing Owner' })).toBeVisible();
    });
});
