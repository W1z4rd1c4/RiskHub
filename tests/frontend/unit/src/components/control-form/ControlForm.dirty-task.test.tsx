import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { Link, RouterProvider, createMemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { ControlForm } from '@/components/control-form/ControlFormContainer';
import i18n from '@/i18n';
import type { Control } from '@/types/control';
import { renderWithoutProviders as render } from '@test/render';
import { server } from '@test/mocks/server';

const initialControl: Control = {
    id: 31,
    name: 'Baseline control',
    description: 'Baseline control description',
    control_form: 'manual',
    data_source: 'Claims ledger',
    methodology_reference: 'CTRL-31',
    process_owner_position: 'Claims manager',
    control_owner_id: 99,
    department_id: 1,
    frequency: 'monthly',
    risk_level: 3,
    status: 'active',
    is_archived: false,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
};

function ControlEditHarness({ control = initialControl, isEdit = true }: { control?: Control; isEdit?: boolean }) {
    const navigate = useNavigate();
    return (
        <>
            <Link to="/done">Leave route</Link>
            <ControlForm
                initialData={control}
                isEdit={isEdit}
                onCancel={() => navigate('/done')}
                onSuccess={(_controlId, locationState) => navigate('/done', { state: locationState })}
            />
        </>
    );
}

function Destination() {
    const location = useLocation();
    const state = location.state as { controlFlash?: { message: string } } | null;
    return (
        <>
            <p>Destination reached</p>
            {state?.controlFlash ? <p>{state.controlFlash.message}</p> : null}
        </>
    );
}

function renderControlEdit(control?: Control, isEdit = true) {
    const router = createMemoryRouter([
        { path: '/edit', element: <ControlEditHarness control={control} isEdit={isEdit} /> },
        { path: '/done', element: <Destination /> },
    ], { initialEntries: ['/edit'] });
    render(<RouterProvider router={router} />);
    return router;
}

function moveToStep(name: string) {
    fireEvent.click(screen.getByRole('button', { name }));
}

async function submitChangedControl() {
    fireEvent.change(screen.getByDisplayValue('Baseline control'), {
        target: { value: 'Changed control' },
    });
    moveToStep('Link Risk');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Control' }));
}

describe('ControlForm dirty-task protection', () => {
    beforeEach(() => {
        server.use(
            http.get('*/api/v1/departments', () => HttpResponse.json([])),
        );
    });

    it('prompts before leaving after a writable field changes', async () => {
        const router = renderControlEdit();
        await screen.findByTestId('control-form-lookups-ready');

        fireEvent.change(screen.getByDisplayValue('Baseline control'), {
            target: { value: 'Changed control' },
        });
        fireEvent.click(screen.getByRole('link', { name: 'Leave route' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
        expect(router.state.location.pathname).toBe('/edit');
    });

    it('does not treat owner lookup text as form data', async () => {
        const withoutOwner = { ...initialControl, control_owner_id: undefined };
        renderControlEdit(withoutOwner);
        await screen.findByTestId('control-form-lookups-ready');
        moveToStep('Ownership');
        fireEvent.change(screen.getByPlaceholderText('Search owners...'), {
            target: { value: 'lookup only' },
        });
        moveToStep('Identity');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('includes the optional Risk link draft in the dirty snapshot', async () => {
        const router = renderControlEdit();
        await screen.findByTestId('control-form-lookups-ready');

        moveToStep('Link Risk');
        fireEvent.click(screen.getByRole('button', { name: /Authentication Drift/i }));
        moveToStep('Identity');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/edit');
    });

    it('treats removing a selected Risk as an exact undo of its link metadata', async () => {
        const user = userEvent.setup();
        renderControlEdit();
        await screen.findByTestId('control-form-lookups-ready');

        moveToStep('Link Risk');
        fireEvent.click(screen.getByRole('button', { name: /Authentication Drift/i }));
        await user.click(screen.getByRole('combobox'));
        await user.click(await screen.findByRole('option', { name: 'Low' }));
        fireEvent.change(screen.getByPlaceholderText('Rationale for this link...'), {
            target: { value: 'Temporary link notes' },
        });
        const selectedRiskCard = screen.getByText('Authentication Drift').closest('.p-4');
        expect(selectedRiskCard).not.toBeNull();
        fireEvent.click(within(selectedRiskCard as HTMLElement).getByRole('button'));
        moveToStep('Identity');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('keeps a changed create draft dirty and becomes clean after an exact revert', async () => {
        const router = renderControlEdit(initialControl, false);
        await screen.findByTestId('control-form-lookups-ready');

        fireEvent.change(screen.getByDisplayValue('Baseline control'), {
            target: { value: 'Changed create control' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
        expect(router.state.location.pathname).toBe('/edit');

        fireEvent.change(screen.getByDisplayValue('Changed create control'), {
            target: { value: 'Baseline control' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('accepts a direct save before success navigation', async () => {
        server.use(
            http.patch('*/api/v1/controls/31', async ({ request }) => {
                const body = await request.json() as Record<string, unknown>;
                return HttpResponse.json({ ...initialControl, ...body });
            }),
        );

        renderControlEdit();
        await screen.findByTestId('control-form-lookups-ready');
        await submitChangedControl();
        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('accepts a direct create before success navigation', async () => {
        server.use(
            http.post('*/api/v1/controls', async ({ request }) => {
                const body = await request.json() as Record<string, unknown>;
                return HttpResponse.json({ ...initialControl, ...body, id: 72 }, { status: 201 });
            }),
        );
        renderControlEdit(initialControl, false);
        await screen.findByTestId('control-form-lookups-ready');
        fireEvent.change(screen.getByDisplayValue('Baseline control'), {
            target: { value: 'Changed control' },
        });
        for (let step = 0; step < 4; step += 1) {
            fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        }
        fireEvent.click(screen.getByRole('button', { name: 'Create Control' }));

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('locks submitted Control fields until a deferred save settles', async () => {
        const user = userEvent.setup();
        let resolveSave: ((response: Response) => void) | undefined;
        server.use(
            http.patch('*/api/v1/controls/31', () => new Promise<Response>((resolve) => {
                resolveSave = resolve;
            })),
        );
        renderControlEdit();
        await screen.findByTestId('control-form-lookups-ready');
        fireEvent.change(screen.getByDisplayValue('Baseline control'), {
            target: { value: 'Changed control' },
        });
        moveToStep('Link Risk');
        fireEvent.click(screen.getByRole('button', { name: /Authentication Drift/i }));
        const notes = screen.getByPlaceholderText('Rationale for this link...');
        fireEvent.change(notes, { target: { value: 'Submitted link notes' } });
        fireEvent.click(screen.getByRole('button', { name: 'Edit Control' }));

        await waitFor(() => expect(notes).toBeDisabled());
        await user.type(notes, 'Late mutation');
        expect(notes).toHaveValue('Submitted link notes');

        await act(async () => {
            resolveSave?.(HttpResponse.json({ ...initialControl, name: 'Changed control' }));
        });
        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
    });

    it('accepts the saved entity and preserves warning flash when Risk linking fails', async () => {
        server.use(
            http.patch('*/api/v1/controls/31', async ({ request }) => {
                const body = await request.json() as Record<string, unknown>;
                return HttpResponse.json({ ...initialControl, ...body });
            }),
            http.post('*/api/v1/controls/31/risks', () =>
                HttpResponse.json({ detail: 'Risk link failed' }, { status: 500 })),
        );

        renderControlEdit();
        await screen.findByTestId('control-form-lookups-ready');
        fireEvent.change(screen.getByDisplayValue('Baseline control'), {
            target: { value: 'Changed control' },
        });
        moveToStep('Link Risk');
        fireEvent.click(screen.getByRole('button', { name: /Authentication Drift/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Edit Control' }));

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.getByText('Control updated, but linking the selected risk failed.')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('uses the create-mode warning when Risk linking fails after creation', async () => {
        server.use(
            http.post('*/api/v1/controls', async ({ request }) => {
                const body = await request.json() as Record<string, unknown>;
                return HttpResponse.json({ ...initialControl, ...body, id: 72 }, { status: 201 });
            }),
            http.post('*/api/v1/controls/72/risks', () =>
                HttpResponse.json({ detail: 'Risk link failed' }, { status: 500 })),
        );
        renderControlEdit(initialControl, false);
        await screen.findByTestId('control-form-lookups-ready');
        fireEvent.change(screen.getByDisplayValue('Baseline control'), {
            target: { value: 'Changed control' },
        });
        for (let step = 0; step < 4; step += 1) {
            fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        }
        fireEvent.click(screen.getByRole('button', { name: /Authentication Drift/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Create Control' }));

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.getByText('Control created, but linking the selected risk failed.')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('provides localized create and update Risk-link failure warnings', () => {
        expect(i18n.t('controls:form.risk_link_failed_after_create', { lng: 'en' }))
            .toBe('Control created, but linking the selected risk failed.');
        expect(i18n.t('controls:form.risk_link_failed_after_update', { lng: 'en' }))
            .toBe('Control updated, but linking the selected risk failed.');
        expect(i18n.t('controls:form.risk_link_failed_after_create', { lng: 'cs' }))
            .toBe('Kontrola byla vytvořena, ale propojení s vybraným rizikem se nezdařilo.');
        expect(i18n.t('controls:form.risk_link_failed_after_update', { lng: 'cs' }))
            .toBe('Kontrola byla aktualizována, ale propojení s vybraným rizikem se nezdařilo.');
    });

    it('accepts a queued save before a later route navigation', async () => {
        server.use(
            http.patch('*/api/v1/controls/31', () => HttpResponse.json({
                status: 'approval_required',
                approval_id: 91,
                action_type: 'edit',
                message: 'Control update queued for approval.',
                pending_fields: ['name'],
            }, { status: 202 })),
        );
        renderControlEdit();
        await screen.findByTestId('control-form-lookups-ready');
        await submitChangedControl();
        expect(await screen.findByText('Control update queued for approval.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Leave route' }));
        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('keeps a failed save dirty', async () => {
        server.use(
            http.patch('*/api/v1/controls/31', () =>
                HttpResponse.json({ detail: 'Control save failed' }, { status: 500 })),
        );
        renderControlEdit();
        await screen.findByTestId('control-form-lookups-ready');
        await submitChangedControl();
        expect(await screen.findByText(/Server error/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Leave route' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    });
});
