import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useKriFormState } from '@/components/kri-form/useKriFormState';

function KriFormStateHarness() {
    const state = useKriFormState({
        initialData: { metric_name: 'Initial metric' },
        initialLinkedVendorIds: [12],
        vendorContext: { vendorId: 12, vendorName: 'Vendor Twelve', returnTo: '/vendors/12' },
    });

    return (
        <div>
            <div data-testid="metric-name">{state.formData.metric_name}</div>
            <div data-testid="current-step">{state.currentStep}</div>
            <div data-testid="error">{state.error ?? 'none'}</div>
            <div data-testid="vendor-mode">{String(state.showOnlyVendorLinkedRisks)}</div>
            <div data-testid="vendor-ids">{state.selectedVendorIds.join(',')}</div>
            <button
                type="button"
                onClick={() => state.setFormField('metric_name', 'Updated metric')}
            >
                update-metric
            </button>
            <button
                type="button"
                onClick={() => state.setStatePatch({ selectedVendorIds: [12, 21] })}
            >
                update-vendors
            </button>
            <button
                type="button"
                onClick={() => state.setStatePatch({ currentStep: 1, error: 'needs review' })}
            >
                patch-ui-state
            </button>
        </div>
    );
}

describe('useKriFormState', () => {
    it('initializes vendor-context state and updates form fields through the reducer', () => {
        render(<KriFormStateHarness />);

        expect(screen.getByTestId('metric-name')).toHaveTextContent('Initial metric');
        expect(screen.getByTestId('vendor-mode')).toHaveTextContent('true');
        expect(screen.getByTestId('vendor-ids')).toHaveTextContent('12');

        fireEvent.click(screen.getByRole('button', { name: 'update-metric' }));
        fireEvent.click(screen.getByRole('button', { name: 'update-vendors' }));

        expect(screen.getByTestId('metric-name')).toHaveTextContent('Updated metric');
        expect(screen.getByTestId('vendor-ids')).toHaveTextContent('12,21');
    });

    it('patches non-form UI state through one typed patch setter', () => {
        render(<KriFormStateHarness />);

        expect(screen.getByTestId('current-step')).toHaveTextContent('0');
        expect(screen.getByTestId('error')).toHaveTextContent('none');

        fireEvent.click(screen.getByRole('button', { name: 'patch-ui-state' }));

        expect(screen.getByTestId('current-step')).toHaveTextContent('1');
        expect(screen.getByTestId('error')).toHaveTextContent('needs review');
    });
});
