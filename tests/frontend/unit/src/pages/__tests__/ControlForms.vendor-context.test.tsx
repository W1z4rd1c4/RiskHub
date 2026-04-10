import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlNewPage } from '@/pages/ControlNewPage';

const mockNavigate = vi.fn();
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

vi.mock('@/components/ControlForm', () => ({
    ControlForm: ({
        firstStepBackLabel,
        onCancel,
        onSuccess,
    }: {
        firstStepBackLabel?: string;
        onCancel?: () => void;
        onSuccess?: (controlId: number) => void | Promise<void>;
    }) => (
        <div>
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
        mockLinkControl.mockResolvedValue(undefined);
    });

    it('auto-links a new control to the vendor and returns to vendor detail', async () => {
        render(<ControlNewPage />);

        expect(screen.getByTestId('control-back-label')).toHaveTextContent(/Back to vendor|Zpět na dodavatele/i);

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
});
