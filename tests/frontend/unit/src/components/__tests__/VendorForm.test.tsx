import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VendorForm } from '@/components/VendorForm';
import type { Vendor } from '@/types/vendor';

const getVendorOwnersMock = vi.fn();
const getVendorDepartmentsMock = vi.fn();
const getVendorsMock = vi.fn();
const createVendorMock = vi.fn();
const updateVendorMock = vi.fn();

function renderWithQueryClient(ui: ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: string | { defaultValue?: string }) => {
            if (typeof options === 'string') return options;
            return options?.defaultValue ?? key;
        },
    }),
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useTotalAssetsValue: () => ({ totalAssets: 1000000 }),
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getVendorOwners: (...args: unknown[]) => getVendorOwnersMock(...args),
        getVendorDepartments: (...args: unknown[]) => getVendorDepartmentsMock(...args),
    },
}));

vi.mock('@/services/vendorApi', () => ({
    vendorApi: {
        getVendors: (...args: unknown[]) => getVendorsMock(...args),
        createVendor: (...args: unknown[]) => createVendorMock(...args),
        updateVendor: (...args: unknown[]) => updateVendorMock(...args),
    },
}));

vi.mock('@/components/ui/ThemedSelect', () => ({
    ThemedSelect: ({
        value,
        onValueChange,
        options,
        placeholder,
        allowEmpty,
        disabled,
        emptyLabel,
        triggerTestId,
    }: {
        value: string;
        onValueChange: (value: string) => void;
        options: Array<{ value: string; label: string }>;
        placeholder?: string;
        allowEmpty?: boolean;
        disabled?: boolean;
        emptyLabel?: string;
        triggerTestId?: string;
    }) => (
        <select
            aria-label={placeholder ?? 'select'}
            data-testid={triggerTestId}
            disabled={disabled}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
        >
            {allowEmpty ? <option value="">{emptyLabel ?? placeholder ?? 'empty'}</option> : null}
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

describe('VendorForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getVendorOwnersMock.mockResolvedValue([
            {
                id: 7,
                name: 'Owner User',
                department_id: 99,
                department_name: 'Operations',
            },
        ]);
        getVendorDepartmentsMock.mockResolvedValue([
            {
                id: 99,
                name: 'Operations',
                code: 'OPS',
            },
        ]);
        getVendorsMock.mockResolvedValue({
            items: [
                {
                    id: 1,
                    name: 'Existing Vendor',
                    process: 'Claims',
                    subprocess: 'Triage',
                },
            ],
            total: 1,
            offset: 0,
            limit: 100,
        });
        createVendorMock.mockResolvedValue({
            id: 10,
            name: 'New Vendor',
        });
        updateVendorMock.mockResolvedValue({
            id: 10,
            name: 'Renamed Vendor',
        });
    });

    it('validates required fields before submit', async () => {
        renderWithQueryClient(<VendorForm onSaved={vi.fn()} onCancel={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));

        expect(await screen.findByText('errors.name_required')).toBeInTheDocument();
        expect(createVendorMock).not.toHaveBeenCalled();
    });

    it('autofills the department from the selected owner and submits the mapped payload', async () => {
        const onSaved = vi.fn();
        renderWithQueryClient(<VendorForm onSaved={onSaved} onCancel={vi.fn()} />);

        await waitFor(() => expect(getVendorOwnersMock).toHaveBeenCalledWith({ q: undefined, limit: 50 }));
        expect(getVendorDepartmentsMock).toHaveBeenCalledWith({ limit: 200 });

        fireEvent.change(screen.getByPlaceholderText('form.name_placeholder'), {
            target: { value: 'New Vendor' },
        });
        fireEvent.change(screen.getByPlaceholderText('form.process_placeholder'), {
            target: { value: 'Claims' },
        });
        fireEvent.change(screen.getByPlaceholderText('form.subprocess_placeholder'), {
            target: { value: 'Tri' },
        });

        expect(await screen.findByRole('button', { name: 'Triage' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Triage' }));

        fireEvent.change(screen.getByLabelText('form.owner_placeholder'), {
            target: { value: '7' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));

        await waitFor(() => expect(createVendorMock).toHaveBeenCalledTimes(1));
        expect(createVendorMock).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'New Vendor',
                process: 'Claims',
                subprocess: 'Triage',
                department_id: 99,
                outsourcing_owner_user_id: 7,
                vendor_type: 'other',
            }),
        );
        expect(onSaved).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 10,
                name: 'New Vendor',
            }),
        );
    });

    it('lets a record-only owner edit ordinary fields without sending accountability keys', async () => {
        const initialData = {
            id: 42,
            name: 'Owned Vendor',
            process: 'Claims',
            department_id: 99,
            department_name: 'Operations',
            outsourcing_owner_user_id: 7,
            outsourcing_owner: {
                name: 'Owner User',
                email: 'owner@example.test',
                role_name: 'employee',
                department_name: 'Operations',
            },
            vendor_type: 'ict',
            risk_score_1_5: 3,
            supports_important_core_insurance_function: false,
            dora_relevant: false,
            is_significant_vendor: false,
            has_alternative_providers: false,
            capabilities: {
                can_update: true,
                can_manage_accountability: false,
            },
        } as Vendor;

        renderWithQueryClient(
            <VendorForm
                initialData={initialData}
                isEdit
                onSaved={vi.fn()}
                onCancel={vi.fn()}
            />,
        );

        expect(await screen.findByTestId('vendor-form-department')).toBeDisabled();
        expect(screen.getByTestId('vendor-form-owner')).toBeDisabled();
        expect(screen.getByTestId('vendor-form-owner-search')).toBeDisabled();
        await waitFor(() => expect(getVendorsMock).toHaveBeenCalledTimes(1));
        expect(getVendorOwnersMock).not.toHaveBeenCalled();
        expect(getVendorDepartmentsMock).not.toHaveBeenCalled();

        fireEvent.change(screen.getByTestId('vendor-form-name'), {
            target: { value: 'Renamed Vendor' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

        await waitFor(() => expect(updateVendorMock).toHaveBeenCalledTimes(1));
        expect(updateVendorMock).toHaveBeenCalledWith(42, { name: 'Renamed Vendor' });
    });
});
