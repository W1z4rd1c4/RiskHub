import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

    it('passes the selected vendors to the save handler when editing a KRI', async () => {
        const onSave = vi.fn().mockResolvedValue({ kind: 'updated' });
        const onClose = vi.fn();

        render(
            <KRIModal
                risk_id={101}
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

        render(
            <KRIModal
                risk_id={101}
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

    it('creates a KRI with the parent risk id and current value', async () => {
        const onSave = vi.fn().mockResolvedValue({ kind: 'updated' });

        render(
            <KRIModal
                risk_id={101}
                isOpen
                onClose={vi.fn()}
                onSave={onSave}
            />,
        );

        fireEvent.change(screen.getByPlaceholderText(/complaint/i), { target: { value: 'New KRI' } });
        fireEvent.change(screen.getByPlaceholderText(/Describe what/i), { target: { value: 'New description' } });
        fireEvent.click(screen.getByRole('button', { name: /Create|Vytvořit|indicator/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    current_value: 0,
                    description: 'New description',
                    metric_name: 'New KRI',
                    risk_id: 101,
                }),
                [],
            );
        });
    });

    it('excludes readonly current value from edit save payload', async () => {
        const onSave = vi.fn().mockResolvedValue({ kind: 'updated' });

        render(
            <KRIModal
                risk_id={101}
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

        render(
            <KRIModal
                risk_id={101}
                isOpen
                onClose={vi.fn()}
                onSave={onSave}
            />,
        );

        const saveButton = screen.getByRole('button', { name: /Create|Vytvořit|indicator/i });
        expect(saveButton).toBeDisabled();
        fireEvent.click(saveButton);
        expect(onSave).not.toHaveBeenCalled();
    });

    it('confirms delete before calling the delete handler', async () => {
        const onDelete = vi.fn().mockResolvedValue(undefined);

        render(
            <KRIModal
                risk_id={101}
                kri={existingKri()}
                isOpen
                onClose={vi.fn()}
                onSave={vi.fn()}
                onDelete={onDelete}
            />,
        );

        fireEvent.click(screen.getByTitle(/Delete|Smazat/i));
        const dialogMessage = await screen.findByText(/Are you sure/i);
        const dialog = dialogMessage.closest('.confirm-dialog-content');
        expect(dialog).not.toBeNull();
        fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: /Delete|Smazat/i }));

        await waitFor(() => {
            expect(onDelete).toHaveBeenCalledWith(55);
        });
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
    });
});
