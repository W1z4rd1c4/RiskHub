import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KRIFormContainer } from '@/components/kri-form/KRIFormContainer';

const mocks = vi.hoisted(() => ({
    formState: undefined as unknown,
    setStatePatch: vi.fn(),
}));

vi.mock('@/hooks/useDebouncedValue', () => ({
    useDebouncedValue: (value: unknown) => value,
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { defaultValue?: string }) => {
            const translations: Record<string, string> = {
                'approval_submitted': 'Approval submitted',
                'approvals:title': 'Approvals',
                'common:actions.cancel': 'Cancel',
                'common:actions.close': 'Close',
                'common:actions.view': 'View',
                'errorKeys.kri_approval_required': 'Translated KRI approval required',
            };
            return translations[key] ?? options?.defaultValue ?? key;
        },
    }),
}));

vi.mock('@/components/kri-form/useKriFormState', () => ({
    useKriFormState: () => mocks.formState,
}));

vi.mock('@/components/kri-form/useKriLookups', () => ({
    useKriLookups: () => ({
        genericRisks: [],
        isLoadingGenericRisks: false,
        isLoadingVendorLinkedRisks: false,
        isLoadingVendors: false,
        lookupErrorKey: null,
        selectedRiskRecord: null,
        users: [],
        vendorLinkedRiskIds: [],
        vendorLinkedRisks: [],
        vendorOptions: [],
    }),
}));

vi.mock('@/components/kri-form/useKriSubmit', () => ({
    useKriSubmit: () => ({
        finalizeCreate: vi.fn(),
        handleSubmit: (event: { preventDefault: () => void }) => event.preventDefault(),
    }),
}));

vi.mock('@/components/kri-form/KriFormStepContent', () => ({
    KriFormStepContent: () => <div data-testid="kri-form-step-content" />,
}));

vi.mock('@/components/kri-form/KriFormNavigation', () => ({
    KriFormNavigation: () => <div data-testid="kri-form-navigation" />,
}));

vi.mock('@/components/kri-form/KriFormErrorAlert', () => ({
    KriFormErrorAlert: ({ error }: { error: string }) => <div>{error}</div>,
}));

vi.mock('@/components/kri-form/KriMismatchDialog', () => ({
    KriMismatchDialog: () => <div data-testid="kri-mismatch-dialog" />,
}));

vi.mock('@/components/kri-form/KriVendorContextBanner', () => ({
    KriVendorContextBanner: ({ vendorName }: { vendorName?: string }) => <div>{vendorName}</div>,
}));

function baseFormState() {
    return {
        approvalQueued: { message: 'errorKeys.kri_approval_required' },
        currentStep: 0,
        error: null,
        formData: {
            risk_id: undefined,
            metric_name: '',
            description: '',
            current_value: 0,
            lower_limit: 0,
            upper_limit: 100,
            unit: '%',
            frequency: 'quarterly',
        },
        isMismatchDialogOpen: false,
        isSubmitting: false,
        riskSearch: '',
        selectedCategory: '',
        selectedDeptId: '',
        selectedProcess: '',
        selectedVendorIds: [],
        selectedVendorOptions: [],
        setFormField: vi.fn(),
        setStatePatch: mocks.setStatePatch,
        showOnlyVendorLinkedRisks: false,
        vendorSearch: '',
    };
}

describe('KRIFormContainer approval queued banner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.formState = baseFormState();
    });

    it('renders one shared approval banner with translated queued copy', () => {
        render(
            <MemoryRouter>
                <KRIFormContainer />
            </MemoryRouter>,
        );

        const banners = screen.getAllByTestId('approval-queued-banner');
        expect(banners).toHaveLength(1);

        const banner = banners[0];
        expect(within(banner).getByText('Approval submitted')).toBeVisible();
        expect(within(banner).getByText('Translated KRI approval required')).toBeVisible();
        expect(within(banner).getByRole('link', { name: 'View Approvals' })).toHaveAttribute(
            'href',
            '/approvals',
        );
        expect(within(banner).getByRole('button', { name: 'Close' })).toBeVisible();
    });
});
