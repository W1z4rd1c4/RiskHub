import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KRINewPage } from '@/pages/KRINewPage';

const mockNavigate = vi.fn();
const mockGetKRIs = vi.fn();
const mockGetVendor = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useSearchParams: () => [mockSearchParams],
    };
});

vi.mock('@/services/vendorApi', () => ({
    vendorApi: {
        getVendor: (...args: unknown[]) => mockGetVendor(...args),
    },
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getKRIs: (...args: unknown[]) => mockGetKRIs(...args),
    },
}));

vi.mock('@/components/kri-form/KRIFormContainer', () => ({
    KRIFormContainer: ({
        firstStepBackLabel,
        onCancel,
        vendorContext,
    }: {
        firstStepBackLabel?: string;
        onCancel?: () => void;
        vendorContext?: { vendorId: number; vendorName?: string; returnTo: string } | null;
    }) => (
        <div>
            <div data-testid="kri-back-label">{firstStepBackLabel}</div>
            <div data-testid="kri-vendor-id">{vendorContext?.vendorId}</div>
            <div data-testid="kri-vendor-name">{vendorContext?.vendorName}</div>
            <div data-testid="kri-return-to">{vendorContext?.returnTo}</div>
            <button type="button" onClick={() => onCancel?.()}>
                cancel
            </button>
        </div>
    ),
}));

describe('KRINewPage vendor context', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSearchParams = new URLSearchParams('vendor_id=12&return_to=%2Fvendors%2F12');
        mockGetKRIs.mockResolvedValue({
            items: [],
            total: 0,
            offset: 0,
            limit: 1,
            capabilities: { can_create: true },
        });
        mockGetVendor.mockResolvedValue({
            id: 12,
            name: 'Vendor Twelve',
            capabilities: { can_create_linked_kri: true },
        });
    });

    it('passes vendor context and back label through to the KRI form', async () => {
        render(<KRINewPage />);

        expect(await screen.findByTestId('kri-back-label')).toHaveTextContent(/Back to vendor|Zpět na dodavatele/i);
        expect(screen.getByTestId('kri-vendor-id')).toHaveTextContent('12');
        expect(screen.getByTestId('kri-return-to')).toHaveTextContent('/vendors/12');

        await waitFor(() => {
            expect(mockGetVendor).toHaveBeenCalledWith(12);
        });
        await waitFor(() => {
            expect(screen.getByTestId('kri-vendor-name')).toHaveTextContent('Vendor Twelve');
        });
    });

    it('returns to the vendor when the vendor-context cancel action is used', async () => {
        render(<KRINewPage />);
        await waitFor(() => {
            expect(mockGetVendor).toHaveBeenCalledWith(12);
        });

        fireEvent.click(screen.getByRole('button', { name: 'cancel' }));

        expect(mockNavigate).toHaveBeenCalledWith('/vendors/12');
    });

    it('hides vendor-context creation when the vendor link capability is false', async () => {
        mockGetVendor.mockResolvedValueOnce({
            id: 12,
            name: 'Vendor Twelve',
            capabilities: { can_create_linked_kri: false },
        });

        render(<KRINewPage />);

        await waitFor(() => expect(mockGetVendor).toHaveBeenCalledWith(12));
        expect(screen.queryByTestId('kri-back-label')).not.toBeInTheDocument();
    });
});
