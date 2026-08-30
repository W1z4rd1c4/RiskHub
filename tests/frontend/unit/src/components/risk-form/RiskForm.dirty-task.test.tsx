import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { Link, RouterProvider, createMemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { RiskForm } from '@/components/RiskForm';
import type { Risk } from '@/types/risk';
import { createTestQueryClient } from '@test/queryClient';
import { renderWithQueryClient as render } from '@test/render';
import { server } from '@test/mocks/server';

const initialRisk: Risk = {
    id: 17,
    risk_id_code: 'RISK-017',
    name: 'Baseline risk',
    process: 'Claims',
    subprocess: 'Intake',
    risk_type: 'operational',
    category: 'Operational',
    description: 'Baseline description',
    department_id: 9,
    owner_id: 4,
    gross_probability: 3,
    gross_impact: 3,
    gross_score: 9,
    net_probability: 2,
    net_impact: 2,
    net_score: 4,
    status: 'active',
    is_archived: false,
    is_priority: false,
    acceptance_approver: null,
    acceptance_date: null,
    acceptance_justification: null,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
};

function RiskFormHarness({
    data,
    isEdit,
    successGate,
}: {
    data: Risk;
    isEdit: boolean;
    successGate?: Promise<void>;
}) {
    const navigate = useNavigate();
    return (
        <>
            <Link to="/done">Leave route</Link>
            <RiskForm
                initialData={data}
                isEdit={isEdit}
                onCancel={() => navigate('/done')}
                onSuccess={async (_riskId, acceptNavigation) => {
                    if (successGate) await successGate;
                    acceptNavigation?.();
                    navigate('/done');
                }}
            />
        </>
    );
}

function renderRiskForm(data = initialRisk, isEdit = true, successGate?: Promise<void>) {
    const queryClient = createTestQueryClient();
    const router = createMemoryRouter([
        { path: '/edit', element: <RiskFormHarness data={data} isEdit={isEdit} successGate={successGate} /> },
        { path: '/done', element: <p>Destination reached</p> },
    ], { initialEntries: ['/edit'] });

    render(
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    return router;
}

const renderRiskEdit = () => renderRiskForm();

async function submitChangedRisk() {
    fireEvent.change(screen.getByDisplayValue('Baseline risk'), {
        target: { value: 'Changed risk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Risk Assessment' }));
    fireEvent.click(screen.getByTestId('risk-form-submit-button'));
}

describe('RiskForm dirty-task protection', () => {
    beforeEach(() => {
        server.use(
            http.get('*/api/v1/departments', () => HttpResponse.json([])),
        );
    });

    it('retains a dirty edit on Stay and leaves without a prompt after every field is reverted', async () => {
        const router = renderRiskEdit();

        fireEvent.change(screen.getByDisplayValue('Baseline risk'), {
            target: { value: 'Changed risk' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
        expect(screen.getByDisplayValue('Changed risk')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/edit');

        fireEvent.change(screen.getByDisplayValue('Changed risk'), {
            target: { value: 'Baseline risk' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('accepts automatic Risk-type normalization as the clean create baseline', async () => {
        renderRiskForm({ ...initialRisk, risk_type: 'legacy-risk-type' }, false);

        await screen.findAllByText('Operational');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('keeps a changed create draft dirty and becomes clean after an exact revert', async () => {
        const router = renderRiskForm(initialRisk, false);

        fireEvent.change(screen.getByDisplayValue('Baseline risk'), {
            target: { value: 'Changed create risk' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
        expect(router.state.location.pathname).toBe('/edit');

        fireEvent.change(screen.getByDisplayValue('Changed create risk'), {
            target: { value: 'Baseline risk' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('accepts a direct create before success navigation', async () => {
        server.use(
            http.post('*/api/v1/risks', async ({ request }) => {
                const body = await request.json() as Record<string, unknown>;
                return HttpResponse.json({ ...initialRisk, ...body, id: 72 }, { status: 201 });
            }),
        );
        renderRiskForm(initialRisk, false);

        fireEvent.change(screen.getByDisplayValue('Baseline risk'), {
            target: { value: 'Changed risk' },
        });
        fireEvent.click(screen.getByTestId('risk-form-next-button'));
        fireEvent.click(screen.getByTestId('risk-form-next-button'));
        fireEvent.click(screen.getByTestId('risk-form-submit-button'));

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('accepts a direct save before its success navigation', async () => {
        server.use(
            http.patch('*/api/v1/risks/17', async ({ request }) => {
                const body = await request.json() as Record<string, unknown>;
                return HttpResponse.json({ ...initialRisk, ...body, updated_at: '2026-08-30T10:00:00Z' });
            }),
        );
        renderRiskEdit();

        await submitChangedRisk();

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('locks submitted Risk fields until a deferred save settles', async () => {
        const user = userEvent.setup();
        let resolveSave: ((response: Response) => void) | undefined;
        server.use(
            http.patch('*/api/v1/risks/17', () => new Promise<Response>((resolve) => {
                resolveSave = resolve;
            })),
        );
        renderRiskEdit();

        fireEvent.change(screen.getByDisplayValue('Baseline risk'), {
            target: { value: 'Changed risk' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Risk Assessment' }));
        const approver = screen.getByTestId('risk-acceptance-approver');
        fireEvent.change(approver, { target: { value: 'Submitted approver' } });
        fireEvent.click(screen.getByTestId('risk-form-submit-button'));

        await waitFor(() => expect(approver).toBeDisabled());
        await user.type(approver, 'Late mutation');
        expect(approver).toHaveValue('Submitted approver');

        await act(async () => {
            resolveSave?.(HttpResponse.json({
                ...initialRisk,
                name: 'Changed risk',
                acceptance_approver: 'Submitted approver',
            }));
        });
        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
    });

    it('keeps user navigation locked across async success work, then permits its accepted navigation', async () => {
        let releaseSuccess: () => void = () => {};
        const successGate = new Promise<void>((resolve) => {
            releaseSuccess = resolve;
        });
        server.use(
            http.patch('*/api/v1/risks/17', () => HttpResponse.json({
                ...initialRisk,
                name: 'Changed risk',
            })),
        );
        const router = renderRiskForm(initialRisk, true, successGate);

        await submitChangedRisk();
        await waitFor(() => expect(screen.getByTestId('risk-form-submit-button')).toHaveAttribute('aria-disabled', 'true'));
        fireEvent.click(screen.getByRole('link', { name: 'Leave route' }));

        expect(router.state.location.pathname).toBe('/edit');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await act(async () => releaseSuccess());
        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
    });

    it('accepts a queued edit but keeps a failed edit dirty', async () => {
        let shouldFail = false;
        server.use(
            http.patch('*/api/v1/risks/17', () => {
                if (shouldFail) {
                    return HttpResponse.json({ detail: 'Save failed' }, { status: 500 });
                }
                return HttpResponse.json({
                    status: 'approval_required',
                    approval_id: 88,
                    action_type: 'edit',
                    message: 'Risk update queued for approval.',
                    pending_fields: ['name'],
                }, { status: 202 });
            }),
        );
        const router = renderRiskEdit();

        await submitChangedRisk();
        expect(await screen.findByText('Risk update queued for approval.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Leave route' }));
        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        shouldFail = true;
        await act(() => router.navigate('/edit'));
        await screen.findByDisplayValue('Baseline risk');
        await submitChangedRisk();
        expect(await screen.findByText(/Server error/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Leave route' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/edit');
    });
});
