import { useState } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlCreateDialog } from '@/components/ControlCreateDialog';
import type { ControlFormLocationState } from '@/components/control-form/useControlFormWorkflow';
import { renderWithoutProviders as render } from '@test/render';
import { server } from '@test/mocks/server';

type ClosePath = 'backdrop' | 'escape' | 'footer' | 'header';

const createdControl = {
    id: 72,
    name: 'Pending control',
    description: 'Pending control description',
    control_form: 'manual',
    data_source: 'Claims ledger',
    methodology_reference: 'CTRL-72',
    process_owner_position: 'Control owner',
    control_owner_id: 99,
    department_id: 1,
    frequency: 'monthly',
    risk_level: 3,
    status: 'draft',
    is_archived: false,
    created_at: '2026-08-30T10:00:00Z',
    updated_at: '2026-08-30T10:00:00Z',
};

function DialogHarness({
    onClose,
    onSuccess,
}: {
    onClose: () => void;
    onSuccess?: (controlId: number, locationState?: ControlFormLocationState) => void;
}) {
    const [isOpen, setIsOpen] = useState(true);
    const close = () => {
        onClose();
        setIsOpen(false);
    };

    return (
        <>
            <p>{isOpen ? 'Dialog open' : 'Dialog closed'}</p>
            <ControlCreateDialog
                isOpen={isOpen}
                onClose={close}
                onSuccess={(controlId, locationState) => {
                    onSuccess?.(controlId, locationState);
                    close();
                }}
            />
        </>
    );
}

function renderDialog({
    onClose = vi.fn(),
    onSuccess,
}: {
    onClose?: () => void;
    onSuccess?: (controlId: number, locationState?: ControlFormLocationState) => void;
} = {}) {
    const router = createMemoryRouter([{
        path: '/',
        element: <DialogHarness onClose={onClose} onSuccess={onSuccess} />,
    }]);
    render(<RouterProvider router={router} />);
}

function requestClose(path: ClosePath) {
    switch (path) {
        case 'backdrop': {
            const backdrop = document.querySelector('[data-dialog-backdrop="true"]');
            expect(backdrop).not.toBeNull();
            fireEvent.click(backdrop as HTMLElement);
            return;
        }
        case 'escape':
            fireEvent.keyDown(document, { key: 'Escape' });
            return;
        case 'footer':
            fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
            return;
        case 'header':
            fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    }
}

async function fillValidControl() {
    fireEvent.change(screen.getByPlaceholderText('e.g. Daily Transaction Reconciliation'), {
        target: { value: 'Pending control' },
    });
    fireEvent.change(screen.getByPlaceholderText('Describe the purpose and steps of this control...'), {
        target: { value: 'Pending control description' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(await screen.findByRole('button', { name: /Control Owner/i }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Chief Accountant'), {
        target: { value: 'Control owner' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByPlaceholderText('Data Source (e.g. SAP Export)'), {
        target: { value: 'Claims ledger' },
    });
    fireEvent.change(screen.getByPlaceholderText('Methodology Reference (e.g. Standard OS 18)'), {
        target: { value: 'CTRL-72' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

describe('ControlCreateDialog dirty-task exits', () => {
    beforeEach(() => {
        server.use(
            http.get('*/api/v1/users/lookup/control-owners', () => HttpResponse.json([{
                id: 99,
                name: 'Control Owner',
                email: 'owner@example.test',
                role_name: 'employee',
                department_id: 1,
                department_name: 'IT',
            }])),
            http.get('*/api/v1/departments', () => HttpResponse.json([{
                id: 1,
                name: 'IT',
                code: 'IT',
                user_count: 0,
                risk_count: 0,
                high_risk_count: 0,
                control_count: 0,
                kri_count: 0,
                breaching_kri_count: 0,
                total_net_score: 0,
            }])),
        );
    });

    it.each<ClosePath>(['header', 'footer', 'escape', 'backdrop'])(
        'keeps a dirty draft on Stay and closes once on Leave via %s',
        async (path) => {
            const onClose = vi.fn();
            renderDialog({ onClose });
            await screen.findByTestId('control-form-lookups-ready');
            const name = screen.getByPlaceholderText('e.g. Daily Transaction Reconciliation');
            fireEvent.change(name, { target: { value: 'Draft control' } });

            requestClose(path);
            expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(name).toHaveValue('Draft control');
            expect(onClose).not.toHaveBeenCalled();

            requestClose(path);
            fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
            expect(await screen.findByText('Dialog closed')).toBeInTheDocument();
            expect(onClose).toHaveBeenCalledTimes(1);
        },
    );

    it.each<ClosePath>(['header', 'footer', 'escape', 'backdrop'])(
        'closes a pristine dialog directly via %s',
        async (path) => {
            const onClose = vi.fn();
            renderDialog({ onClose });
            await screen.findByTestId('control-form-lookups-ready');

            requestClose(path);

            expect(await screen.findByText('Dialog closed')).toBeInTheDocument();
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
            expect(onClose).toHaveBeenCalledTimes(1);
        },
    );

    it('keeps every dialog exit locked while creation is pending', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const onSuccess = vi.fn();
        let resolveCreate: ((response: Response) => void) | undefined;
        server.use(
            http.post('*/api/v1/controls', () => new Promise<Response>((resolve) => {
                resolveCreate = resolve;
            })),
        );
        renderDialog({ onClose, onSuccess });
        await screen.findByTestId('control-form-lookups-ready');
        await fillValidControl();
        const riskSearch = screen.getByPlaceholderText('Search by risk ID, name...');
        fireEvent.click(screen.getByRole('button', { name: 'Create Control' }));
        await waitFor(() => expect(riskSearch).toBeDisabled());

        requestClose('header');
        requestClose('backdrop');
        requestClose('escape');
        await user.click(screen.getByRole('button', { name: 'Back' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await act(async () => {
            resolveCreate?.(HttpResponse.json(createdControl, { status: 201 }));
        });
        expect(await screen.findByText('Dialog closed')).toBeInTheDocument();
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
