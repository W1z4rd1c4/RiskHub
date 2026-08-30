import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KRIModal } from '@/components/kri/KRIModal';
import type { KRIModalSaveResult } from '@/components/kri/KRIModal';
import type { KeyRiskIndicator } from '@/types/kri';

const mockGetRiskOwners = vi.fn();
const mockGetVendors = vi.fn();

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getRiskOwners: (...args: unknown[]) => mockGetRiskOwners(...args),
    },
}));

vi.mock('@/services/vendorApi', () => ({
    vendorApi: {
        getVendors: (...args: unknown[]) => mockGetVendors(...args),
    },
}));

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
        last_updated: '2026-08-30T10:00:00Z',
        created_at: '2026-08-30T10:00:00Z',
        frequency: 'quarterly',
        linked_vendors: [
            { id: 12, name: 'Vendor Twelve' },
            { id: 21, name: 'Vendor Twenty-One' },
        ],
        ...overrides,
    };
}

function renderModal(options: {
    onClose?: () => void;
    onSave?: () => Promise<KRIModalSaveResult>;
} = {}) {
    const onClose = options.onClose ?? vi.fn();
    const onSave = options.onSave ?? vi.fn().mockResolvedValue({ kind: 'updated' });
    const router = createMemoryRouter([{
        path: '/',
        element: (
            <KRIModal
                risk_id={101}
                kri={existingKri()}
                isOpen
                onClose={onClose}
                onSave={onSave}
            />
        ),
    }]);
    render(<RouterProvider router={router} />);
    return { onClose, onSave };
}

function KriLifecycleHarness() {
    const [isOpen, setIsOpen] = useState(true);
    const [kri, setKri] = useState(existingKri());

    return (
        <>
            <button
                type="button"
                onClick={() => setKri(existingKri({ metric_name: 'Server reset KRI' }))}
            >
                Apply server reset
            </button>
            <button type="button" onClick={() => setIsOpen(true)}>
                Reopen KRI
            </button>
            <output>Server version: {kri.metric_name}</output>
            <KRIModal
                risk_id={101}
                kri={kri}
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                onSave={async () => ({ kind: 'updated' })}
            />
        </>
    );
}

function renderLifecycleModal() {
    const router = createMemoryRouter([{ path: '/', element: <KriLifecycleHarness /> }]);
    render(<RouterProvider router={router} />);
}

function changeMetricName() {
    fireEvent.change(screen.getByDisplayValue('Existing KRI'), {
        target: { value: 'Changed KRI' },
    });
}

function requestClose(path: 'header' | 'footer' | 'backdrop' | 'escape') {
    if (path === 'header') {
        fireEvent.click(screen.getByRole('button', { name: /Close|Zavřít/i }));
        return;
    }
    if (path === 'footer') {
        fireEvent.click(screen.getByRole('button', { name: /Cancel|Zrušit/i }));
        return;
    }
    if (path === 'backdrop') {
        fireEvent.click(document.querySelector('[data-dialog-backdrop="true"]') as HTMLElement);
        return;
    }
    fireEvent.keyDown(document, { key: 'Escape' });
}

describe('KRI edit modal dirty-task protection', () => {
    beforeEach(() => {
        mockGetRiskOwners.mockResolvedValue([]);
        mockGetVendors.mockResolvedValue({
            items: [
                { id: 12, name: 'Vendor Twelve' },
                { id: 21, name: 'Vendor Twenty-One' },
            ],
            total: 2,
            offset: 0,
            limit: 25,
        });
    });

    it.each(['header', 'footer', 'backdrop', 'escape'] as const)(
        'routes the %s close path through one unsaved-changes decision',
        async (path) => {
            const { onClose } = renderModal();
            changeMetricName();

            requestClose(path);
            expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: /Stay|Zůstat/i }));
            expect(onClose).not.toHaveBeenCalled();
            expect(screen.getByDisplayValue('Changed KRI')).toBeInTheDocument();

            requestClose(path);
            fireEvent.click(await screen.findByRole('button', { name: /Leave|Opustit/i }));
            expect(onClose).toHaveBeenCalledTimes(1);
        },
    );

    it.each([
        { kind: 'updated' } as const,
        { kind: 'approval', approvalId: 77, message: 'Approval queued' } as const,
    ])('accepts a successful $kind result before closing once', async (result) => {
        const onSave = vi.fn().mockResolvedValue(result);
        const { onClose } = renderModal({ onSave });
        changeMetricName();

        fireEvent.click(screen.getByRole('button', { name: /Save|Uložit/i }));

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('keeps a rejected save dirty', async () => {
        const onSave = vi.fn().mockRejectedValue(new Error('Save rejected'));
        const { onClose } = renderModal({ onSave });
        changeMetricName();

        fireEvent.click(screen.getByRole('button', { name: /Save|Uložit/i }));
        expect(await screen.findByText('Save rejected')).toBeInTheDocument();
        requestClose('footer');

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('excludes lookup search and canonicalizes the selected Vendor set', async () => {
        const { onClose } = renderModal();
        const vendorTwelve = await screen.findByRole('checkbox', { name: 'Vendor Twelve' });

        fireEvent.change(screen.getByPlaceholderText('Search vendors...'), {
            target: { value: 'lookup only' },
        });
        fireEvent.click(vendorTwelve);
        fireEvent.click(vendorTwelve);
        requestClose('footer');

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('rebases after a dirty discard, closed server reset, and reopen lifecycle', async () => {
        renderLifecycleModal();
        changeMetricName();

        requestClose('footer');
        fireEvent.click(await screen.findByRole('button', { name: /Leave|Opustit/i }));
        await waitFor(() => expect(screen.queryByDisplayValue('Changed KRI')).not.toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'Apply server reset' }));
        expect(await screen.findByText('Server version: Server reset KRI')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Reopen KRI' }));
        expect(await screen.findByDisplayValue('Server reset KRI')).toBeInTheDocument();
        requestClose('footer');

        await waitFor(() => expect(screen.queryByDisplayValue('Server reset KRI')).not.toBeInTheDocument());
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('locks close paths while save is pending', async () => {
        const user = userEvent.setup();
        let resolveSave: ((result: KRIModalSaveResult) => void) | undefined;
        const onSave = vi.fn().mockImplementation(() => new Promise<KRIModalSaveResult>((resolve) => {
            resolveSave = resolve;
        }));
        const { onClose } = renderModal({ onSave });
        changeMetricName();

        fireEvent.click(screen.getByRole('button', { name: /Save|Uložit/i }));
        const metricName = screen.getByDisplayValue('Changed KRI');
        expect(metricName).toBeDisabled();
        await user.type(metricName, 'Late mutation');
        expect(metricName).toHaveValue('Changed KRI');
        requestClose('escape');
        requestClose('footer');
        expect(onClose).not.toHaveBeenCalled();

        await act(async () => resolveSave?.({ kind: 'updated' }));
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });
});
