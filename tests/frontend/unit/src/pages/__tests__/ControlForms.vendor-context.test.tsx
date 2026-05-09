import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlNewPage } from '@/pages/ControlNewPage';

const mockNavigate = vi.fn();
const mockGetControls = vi.fn();
const mockGetVendor = vi.fn();
const mockLinkControl = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useSearchParams: () => [mockSearchParams],
    };
});

vi.mock('@/services/vendorLinkApi', () => ({
    vendorLinkApi: {
        linkControl: (...args: unknown[]) => mockLinkControl(...args),
    },
}));

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        getControls: (...args: unknown[]) => mockGetControls(...args),
    },
}));

vi.mock('@/services/vendorApi', () => ({
    vendorApi: {
        getVendor: (...args: unknown[]) => mockGetVendor(...args),
    },
}));

vi.mock('@/components/control-form/ControlFormContainer', () => ({
    ControlForm: ({
        allowRiskLinking,
        firstStepBackLabel,
        onCancel,
        onSuccess,
    }: {
        allowRiskLinking?: boolean;
        firstStepBackLabel?: string;
        onCancel?: () => void;
        onSuccess?: (controlId: number) => void | Promise<void>;
    }) => (
        <div data-allow-risk-linking={String(allowRiskLinking)}>
            <div data-testid="control-back-label">{firstStepBackLabel}</div>
            <button type="button" onClick={() => void onSuccess?.(88)}>submit</button>
            <button type="button" onClick={() => onCancel?.()}>cancel</button>
        </div>
    ),
}));

describe('ControlNewPage vendor context', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSearchParams = new URLSearchParams('vendor_id=12&return_to=%2Fvendors%2F12');
        mockGetControls.mockResolvedValue({
            items: [],
            total: 0,
            offset: 0,
            limit: 1,
            capabilities: { can_create: true },
        });
        mockGetVendor.mockResolvedValue({
            id: 12,
            name: 'Vendor Twelve',
            capabilities: { can_create_linked_control: true },
        });
        mockLinkControl.mockResolvedValue(undefined);
    });

    it('auto-links a new control to the vendor and returns to vendor detail', async () => {
        render(<ControlNewPage />);

        expect(await screen.findByTestId('control-back-label')).toHaveTextContent(/Back to vendor|Zpět na dodavatele/i);
        expect(screen.getByTestId('control-back-label').parentElement).toHaveAttribute(
            'data-allow-risk-linking',
            'false',
        );

        fireEvent.click(screen.getByRole('button', { name: 'submit' }));

        await waitFor(() => {
            expect(mockLinkControl).toHaveBeenCalledWith(12, 88);
        });
        expect(mockNavigate).toHaveBeenCalledWith('/vendors/12', {
            state: {
                vendorFlash: expect.objectContaining({
                    tone: 'success',
                    ctaHref: '/controls/88',
                }),
            },
        });
    });

    it('hides vendor-context creation when the vendor link capability is false', async () => {
        mockGetVendor.mockResolvedValueOnce({
            id: 12,
            name: 'Vendor Twelve',
            capabilities: { can_create_linked_control: false },
        });

        render(<ControlNewPage />);

        await waitFor(() => expect(mockGetVendor).toHaveBeenCalledWith(12));
        expect(screen.queryByTestId('control-back-label')).not.toBeInTheDocument();
    });
});
