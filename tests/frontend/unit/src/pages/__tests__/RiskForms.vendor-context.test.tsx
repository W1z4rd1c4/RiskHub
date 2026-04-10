import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskNewPage } from '@/pages/RiskNewPage';

const mockNavigate = vi.fn();
const mockLinkRisk = vi.fn();
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
        linkRisk: (...args: unknown[]) => mockLinkRisk(...args),
    },
}));

vi.mock('@/components/RiskForm', () => ({
    RiskForm: ({
        firstStepBackLabel,
        onCancel,
        onSuccess,
    }: {
        firstStepBackLabel?: string;
        onCancel?: () => void;
        onSuccess?: (riskId: number) => void | Promise<void>;
    }) => (
        <div>
            <div data-testid="risk-back-label">{firstStepBackLabel}</div>
            <button type="button" onClick={() => void onSuccess?.(77)}>submit</button>
            <button type="button" onClick={() => onCancel?.()}>cancel</button>
        </div>
    ),
}));

describe('RiskNewPage vendor context', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSearchParams = new URLSearchParams('vendor_id=12&return_to=%2Fvendors%2F12');
        mockLinkRisk.mockResolvedValue(undefined);
    });

    it('auto-links a new risk to the vendor and returns to vendor detail', async () => {
        render(<RiskNewPage />);

        expect(screen.getByTestId('risk-back-label')).toHaveTextContent(/Back to vendor|Zpět na dodavatele/i);

        fireEvent.click(screen.getByRole('button', { name: 'submit' }));

        await waitFor(() => {
            expect(mockLinkRisk).toHaveBeenCalledWith(12, 77);
        });
        expect(mockNavigate).toHaveBeenCalledWith('/vendors/12', {
            state: {
                vendorFlash: expect.objectContaining({
                    tone: 'success',
                    ctaHref: '/risks/77',
                }),
            },
        });
    });

    it('returns to the vendor with a warning when linking fails after create', async () => {
        mockLinkRisk.mockRejectedValueOnce(new Error('link failed'));

        render(<RiskNewPage />);
        fireEvent.click(screen.getByRole('button', { name: 'submit' }));

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/vendors/12', {
                state: {
                    vendorFlash: expect.objectContaining({
                        tone: 'warn',
                        ctaHref: '/risks/77',
                    }),
                },
            });
        });
    });
});
