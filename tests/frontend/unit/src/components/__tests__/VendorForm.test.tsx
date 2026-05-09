import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VendorForm } from '@/components/VendorForm';

const getUsersMock = vi.fn();
const getDepartmentsMock = vi.fn();
const getVendorsMock = vi.fn();
const createVendorMock = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useTotalAssetsValue: () => ({ totalAssets: 1000000 }),
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getUsers: (...args: unknown[]) => getUsersMock(...args),
        getDepartments: (...args: unknown[]) => getDepartmentsMock(...args),
    },
}));

vi.mock('@/services/vendorApi', () => ({
    vendorApi: {
        getVendors: (...args: unknown[]) => getVendorsMock(...args),
        createVendor: (...args: unknown[]) => createVendorMock(...args),
        updateVendor: vi.fn(),
    },
}));

vi.mock('@/components/ui/ThemedSelect', () => ({
    ThemedSelect: ({
        value,
        onValueChange,
        options,
        placeholder,
        allowEmpty,
        emptyLabel,
    }: {
        value: string;
        onValueChange: (value: string) => void;
        options: Array<{ value: string; label: string }>;
        placeholder?: string;
        allowEmpty?: boolean;
        emptyLabel?: string;
    }) => (
        <select
            aria-label={placeholder ?? 'select'}
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
        getUsersMock.mockResolvedValue([
            {
                id: 7,
                name: 'Owner User',
                department_id: 99,
                department_name: 'Operations',
            },
        ]);
        getDepartmentsMock.mockResolvedValue([
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
    });

    it('validates required fields before submit', async () => {
        render(<VendorForm onSaved={vi.fn()} onCancel={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));

        expect(await screen.findByText('errors.name_required')).toBeInTheDocument();
        expect(createVendorMock).not.toHaveBeenCalled();
    });

    it('autofills the department from the selected owner and submits the mapped payload', async () => {
        const onSaved = vi.fn();
        render(<VendorForm onSaved={onSaved} onCancel={vi.fn()} />);

        await waitFor(() => expect(getUsersMock).toHaveBeenCalled());

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
});
