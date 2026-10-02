import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { KRIModal } from '@/components/kri/KRIModal';
import { ApiClientError } from '@/services/apiClient';
import type { KeyRiskIndicator } from '@/types/kri';

const mockListVisibleUsers = vi.fn();
const mockGetVendors = vi.fn();

vi.mock('@/services/userApi', () => ({
    userApi: {
        listVisibleUsers: (...args: unknown[]) => mockListVisibleUsers(...args),
    },
}));

vi.mock('@/services/vendorApi', () => ({
    vendorApi: {
        getVendors: (...args: unknown[]) => mockGetVendors(...args),
    },
}));

describe('KRIModal vendor selection', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    beforeEach(() => {
        vi.clearAllMocks();
        mockListVisibleUsers.mockResolvedValue([]);
        mockGetVendors.mockResolvedValue({
            items: [
                { id: 12, name: 'Vendor Twelve', status: 'active' },
                { id: 21, name: 'Vendor Twenty-One', status: 'active' },
            ],
            total: 2,
            offset: 0,
            limit: 25,
        });
    });

    function existingKri(overrides: Partial<KeyRiskIndicator> = {}): KeyRiskIndicator {
        return {
            id: 55,
            risk_id: 101,
            metric_name: 'Existing KRI',
            description: 'Existing description',
            current_value: 10,
            lower_limit: 2,
            upper_limit: 80,
            unit: '%',
            breach_status: 'within',
            last_updated: '2026-03-15T10:00:00Z',
            created_at: '2026-03-10T10:00:00Z',
            frequency: 'quarterly',
            linked_vendors: [{ id: 12, name: 'Vendor Twelve' }],
            ...overrides,
        };
    }

    function renderModal(modal: React.ReactElement) {
        const router = createMemoryRouter([{ path: '/', element: modal }]);
        return render(<RouterProvider router={router} />);
    }

    it('passes the selected vendors to the save handler when editing a KRI', async () => {
        const onSave = vi.fn().mockResolvedValue({ kind: 'updated' });
        const onClose = vi.fn();

        renderModal(
            <KRIModal
                kri={existingKri()}
                isOpen
                onClose={onClose}
                onSave={onSave}
            />,
        );

        const vendorCheckbox = await screen.findByRole('checkbox', { name: /Vendor Twenty-One/i });
        fireEvent.click(vendorCheckbox);
        fireEvent.click(screen.getByRole('button', { name: /Save|Uložit/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    metric_name: 'Existing KRI',
                }),
                [12, 21],
            );
        });
        expect(onClose).toHaveBeenCalled();
    });

    it('keeps the modal open and shows the backend error when save fails', async () => {
        const onSave = vi.fn().mockRejectedValue(
            new ApiClientError({
                status: 403,
                code: 'FORBIDDEN',
                messageKey: 'errorKeys.permission_denied',
                rawMessage: 'You cannot assign vendors to this KRI.',
            }),
        );
        const onClose = vi.fn();

        renderModal(
            <KRIModal
                kri={existingKri()}
                isOpen
                onClose={onClose}
                onSave={onSave}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Save|Uložit/i }));

        await screen.findByText('You cannot assign vendors to this KRI.');
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByDisplayValue('Existing KRI')).toBeInTheDocument();
    });

    it('excludes readonly current value from edit save payload', async () => {
        const onSave = vi.fn().mockResolvedValue({ kind: 'updated' });

        renderModal(
            <KRIModal
                kri={existingKri({ current_value: 42 })}
                isOpen
                onClose={vi.fn()}
                onSave={onSave}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Save|Uložit/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledWith(
                expect.not.objectContaining({ current_value: 42 }),
                [12],
            );
        });
    });

    it('blocks saving while required draft fields are missing', async () => {
        const onSave = vi.fn().mockResolvedValue({ kind: 'updated' });

        renderModal(
            <KRIModal
                kri={existingKri()}
                isOpen
                onClose={vi.fn()}
                onSave={onSave}
            />,
        );

        fireEvent.change(screen.getByDisplayValue('Existing KRI'), { target: { value: '   ' } });
        const saveButton = screen.getByRole('button', { name: /Save|Uložit/i });
        expect(saveButton).toBeDisabled();
        fireEvent.click(saveButton);
        expect(onSave).not.toHaveBeenCalled();
    });

    it('offers no delete or create path (edit-only modal)', () => {
        renderModal(
            <KRIModal
                kri={existingKri()}
                isOpen
                onClose={vi.fn()}
                onSave={vi.fn()}
            />,
        );

        expect(screen.queryByTitle(/Delete|Smazat/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Create|Vytvořit/i })).not.toBeInTheDocument();
        expect(screen.getByRole('spinbutton', { name: /current value|aktuální hodnota/i })).toBeDisabled();
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
    });
});
