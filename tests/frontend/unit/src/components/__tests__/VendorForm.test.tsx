import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter, useNavigate } from 'react-router-dom';
import * as axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VendorForm } from '@/components/VendorForm';
import { processApprovalQueuedResponseSchema } from '@/services/api/schemas';
import type { Vendor } from '@/types/vendor';

const getVendorOwnersMock = vi.fn();
const getVendorDepartmentsMock = vi.fn();
const getVendorsMock = vi.fn();
const createVendorMock = vi.fn();
const updateVendorMock = vi.fn();
const accountabilityScenario = vi.hoisted(() => ({
    enabled: true,
    error: false,
    loading: false,
    protectedVendorEnabled: false,
}));

vi.mock('@/hooks/useAccountabilityReassignmentScenario', () => ({
    useAccountabilityReassignmentScenario: () => ({
        isEnabled: accountabilityScenario.enabled,
        isError: accountabilityScenario.error,
        isLoading: accountabilityScenario.loading,
        requiresApproval: (key: string) => (
            key === 'accountability_reassignment'
                ? accountabilityScenario.enabled
                : key === 'protected_vendor_edit' && accountabilityScenario.protectedVendorEnabled
        ),
    }),
}));

function renderWithQueryClient(ui: ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter([{ path: '*', element: ui }]);
    return render(
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
}

async function expectNoAxeViolations(node: Element): Promise<void> {
    const results = await axe.run(node, {
        runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
        },
        rules: { 'color-contrast': { enabled: false } },
    });
    const summary = results.violations
        .map((violation) => `${violation.id} (${violation.nodes.length}): ${violation.help}`)
        .join('\n');
    expect(summary, summary).toBe('');
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
        accountabilityScenario.enabled = true;
        accountabilityScenario.error = false;
        accountabilityScenario.loading = false;
        accountabilityScenario.protectedVendorEnabled = false;
        getVendorOwnersMock.mockResolvedValue([
            {
                id: 7,
                name: 'Owner User',
                department_id: 99,
                department_name: 'Operations',
            },
            {
                id: 8,
                name: 'Replacement Owner',
                department_id: 101,
                department_name: 'Finance',
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

    it('associates the Vendor identity labels with their editable fields', () => {
        renderWithQueryClient(<VendorForm onSaved={vi.fn()} onCancel={vi.fn()} />);

        for (const label of [
            'form.name',
            'form.legal_name',
            'form.registration_id',
            'form.website',
            'form.description',
        ]) {
            expect(screen.getByRole('textbox', { name: label })).toBeInTheDocument();
        }
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

    it('submits the business reason and routes a protected edit to the queued callback', async () => {
        const onSaved = vi.fn();
        const onApprovalQueued = vi.fn();
        updateVendorMock.mockResolvedValue({
            status: 'approval_required',
            approval_id: 87,
            proposal_id: 55,
            proposal_version: 1,
        });
        const initialData = {
            id: 42,
            name: 'Protected Vendor',
            process: 'Claims',
            department_id: 99,
            department_name: 'Operations',
            outsourcing_owner_user_id: 7,
            vendor_type: 'ict',
            risk_score_1_5: 5,
            supports_important_core_insurance_function: true,
            dora_relevant: true,
            is_significant_vendor: true,
            has_alternative_providers: false,
            capabilities: {
                can_update: true,
                protected_change_requires_approval: true,
            },
        } as Vendor;

        renderWithQueryClient(
            <VendorForm
                initialData={initialData}
                isEdit
                onSaved={onSaved}
                onApprovalQueued={onApprovalQueued}
            />,
        );

        fireEvent.change(screen.getByTestId('vendor-form-name'), {
            target: { value: 'Protected Vendor v2' },
        });
        fireEvent.change(screen.getByLabelText('form.request_reason'), {
            target: { value: 'Material service change' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

        await waitFor(() => expect(updateVendorMock).toHaveBeenCalledTimes(1));
        expect(updateVendorMock).toHaveBeenCalledWith(42, {
            name: 'Protected Vendor v2',
            request_reason: 'Material service change',
        });
        expect(onApprovalQueued).toHaveBeenCalledWith(expect.objectContaining({ approval_id: 87 }));
        expect(onSaved).not.toHaveBeenCalled();
    });

    const nonProtectedVendor = {
        id: 42,
        name: 'Ordinary Vendor',
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
            can_manage_accountability: true,
            protected_change_requires_approval: false,
        },
    } as Vendor;
    const protectedVendor = {
        ...nonProtectedVendor,
        derived: {
            tier: 'critical',
        },
    } as Vendor;

    function NavigatingVendorEdit() {
        const navigate = useNavigate();
        return (
            <VendorForm
                initialData={nonProtectedVendor}
                isEdit
                onSaved={(saved) => void navigate(`/vendors/${saved.id}`)}
                onApprovalQueued={(queued) => void navigate(`/approvals?tab=mine&approvalId=${queued.approval_id}`)}
                onCancel={() => void navigate('/vendors/42')}
            />
        );
    }

    function renderNavigatingVendorEdit() {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        const router = createMemoryRouter([
            { path: '/vendors/42/edit', element: <NavigatingVendorEdit /> },
            { path: '/vendors/42', element: <p>Vendor detail</p> },
            { path: '/approvals', element: <p>Approvals</p> },
        ], { initialEntries: ['/vendors/42/edit'] });
        const utils = render(
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );
        return { router, ...utils };
    }

    function NavigatingVendorCreate() {
        const navigate = useNavigate();
        return (
            <VendorForm
                onSaved={(saved) => void navigate(`/vendors/${saved.id}`)}
                onCancel={() => void navigate('/vendors')}
            />
        );
    }

    function renderNavigatingVendorCreate() {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const router = createMemoryRouter([
            { path: '/vendors/new', element: <NavigatingVendorCreate /> },
            { path: '/vendors', element: <p>Vendors</p> },
        ], { initialEntries: ['/vendors/new'] });
        render(
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );
        return router;
    }

    describe('dirty task protection (#158)', () => {
        it('guards a create draft and becomes clean after an exact semantic revert', async () => {
            const user = userEvent.setup();
            const router = renderNavigatingVendorCreate();
            const name = screen.getByTestId('vendor-form-name');

            await user.type(name, 'New Vendor');
            await user.click(screen.getByRole('button', { name: 'actions.cancel' }));
            expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
            expect(router.state.location.pathname).toBe('/vendors/new');
            await user.click(screen.getByRole('button', { name: 'actions.stay' }));

            await user.clear(name);
            await user.type(name, '  ');
            await user.click(screen.getByRole('button', { name: 'actions.cancel' }));
            await waitFor(() => expect(router.state.location.pathname).toBe('/vendors'));
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        });

        it('prompts for a semantic edit, keeps the draft on Stay, and clears when the payload is reverted', async () => {
            const user = userEvent.setup();
            const { router } = renderNavigatingVendorEdit();

            const name = screen.getByTestId('vendor-form-name');
            await user.clear(name);
            await user.type(name, 'Changed Vendor');
            await user.click(screen.getByRole('button', { name: 'actions.cancel' }));

            expect(await screen.findByRole('alertdialog')).toHaveTextContent('confirmation.unsaved_changes');
            expect(router.state.location.pathname).toBe('/vendors/42/edit');
            await user.click(screen.getByRole('button', { name: 'actions.stay' }));
            expect(name).toHaveValue('Changed Vendor');

            await user.clear(name);
            await user.type(name, '  Ordinary Vendor  ');
            await user.click(screen.getByRole('button', { name: 'actions.cancel' }));

            await waitFor(() => expect(router.state.location.pathname).toBe('/vendors/42'));
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        });

        it('locks editable fields and Cancel while the accepted save is pending', async () => {
            const user = userEvent.setup();
            let resolveUpdate: (vendor: Vendor) => void = () => {};
            updateVendorMock.mockReturnValue(new Promise((resolve) => {
                resolveUpdate = resolve;
            }));
            const { router } = renderNavigatingVendorEdit();

            const name = screen.getByTestId('vendor-form-name');
            await user.clear(name);
            await user.type(name, 'Updated Vendor');
            await user.click(screen.getByRole('button', { name: 'actions.save' }));
            await waitFor(() => expect(updateVendorMock).toHaveBeenCalledTimes(1));

            expect(name).toBeDisabled();
            expect(screen.getByRole('button', { name: 'actions.cancel' })).toBeDisabled();

            await act(async () => resolveUpdate({ ...nonProtectedVendor, name: 'Updated Vendor' }));
            await waitFor(() => expect(router.state.location.pathname).toBe('/vendors/42'));
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        });

        it('keeps an invalid edit dirty', async () => {
            const user = userEvent.setup();
            const { router } = renderNavigatingVendorEdit();

            await user.clear(screen.getByTestId('vendor-form-name'));
            await user.click(screen.getByRole('button', { name: 'actions.save' }));
            expect(await screen.findByText('errors.name_required')).toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: 'actions.cancel' }));

            expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
            expect(router.state.location.pathname).toBe('/vendors/42/edit');
        });

        it('accepts an approval-queued edit before navigating', async () => {
            const user = userEvent.setup();
            updateVendorMock.mockResolvedValue(processApprovalQueuedResponseSchema.parse({
                status: 'approval_required',
                message: 'Submitted',
                approval_id: 101,
                action_type: 'edit',
                pending_fields: ['name'],
                proposal_id: 'proposal-vendor-101',
                proposal_version: 1,
            }));
            const { router } = renderNavigatingVendorEdit();

            await user.clear(screen.getByTestId('vendor-form-name'));
            await user.type(screen.getByTestId('vendor-form-name'), 'Queued Vendor');
            await user.click(screen.getByRole('button', { name: 'actions.save' }));

            await waitFor(() => expect(router.state.location.pathname).toBe('/approvals'));
            expect(router.state.location.search).toBe('?tab=mine&approvalId=101');
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        });
    });

    describe('governed Outsourcing Owner edit (#88)', () => {
        it('requires and focuses a localized reason for an actual Outsourcing Owner delta', async () => {
            const { container } = renderWithQueryClient(
                <VendorForm initialData={nonProtectedVendor} isEdit onSaved={vi.fn()} />,
            );
            await waitFor(() => expect(getVendorOwnersMock).toHaveBeenCalledTimes(1));

            fireEvent.change(screen.getByTestId('vendor-form-owner'), {
                target: { value: '8' },
            });

            expect(screen.getByRole('button', { name: 'actions.submit_for_approval' })).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'actions.submit_for_approval' }));

            const reason = screen.getByTestId('vendor-form-request-reason');
            expect(await screen.findAllByText('vendors:errors.request_reason_required')).toHaveLength(2);
            expect(reason).toHaveAttribute('aria-invalid', 'true');
            await waitFor(() => expect(reason).toHaveFocus());
            expect(updateVendorMock).not.toHaveBeenCalled();
            await expectNoAxeViolations(reason.parentElement ?? container);
        });

        it('hands a typed owner reassignment 202 to the existing approval callback', async () => {
            const onSaved = vi.fn();
            const onApprovalQueued = vi.fn();
            updateVendorMock.mockResolvedValue(
                processApprovalQueuedResponseSchema.parse({
                    status: 'approval_required',
                    message: 'Submitted',
                    approval_id: 88,
                    action_type: 'edit',
                    pending_fields: ['outsourcing_owner_user_id'],
                    proposal_id: 'proposal-vendor-accountability-88',
                    proposal_version: 1,
                }),
            );
            renderWithQueryClient(
                <VendorForm
                    initialData={nonProtectedVendor}
                    isEdit
                    onSaved={onSaved}
                    onApprovalQueued={onApprovalQueued}
                />,
            );
            await waitFor(() => expect(getVendorOwnersMock).toHaveBeenCalledTimes(1));

            fireEvent.change(screen.getByTestId('vendor-form-owner'), {
                target: { value: '8' },
            });
            fireEvent.change(screen.getByTestId('vendor-form-request-reason'), {
                target: { value: 'Transfer accountability to the service owner' },
            });
            fireEvent.click(screen.getByRole('button', { name: 'actions.submit_for_approval' }));

            await waitFor(() =>
                expect(updateVendorMock).toHaveBeenCalledWith(42, {
                    outsourcing_owner_user_id: 8,
                    request_reason: 'Transfer accountability to the service owner',
                }),
            );
            expect(onApprovalQueued).toHaveBeenCalledWith(
                expect.objectContaining({
                    approval_id: 88,
                    proposal_id: 'proposal-vendor-accountability-88',
                }),
            );
            expect(onSaved).not.toHaveBeenCalled();
        });

        it('requires approval when protected Vendor governance is enabled but accountability governance is disabled', async () => {
            accountabilityScenario.enabled = false;
            accountabilityScenario.protectedVendorEnabled = true;
            renderWithQueryClient(
                <VendorForm initialData={protectedVendor} isEdit onSaved={vi.fn()} />,
            );
            await waitFor(() => expect(getVendorOwnersMock).toHaveBeenCalledTimes(1));

            fireEvent.change(screen.getByTestId('vendor-form-owner'), {
                target: { value: '8' },
            });

            expect(screen.getByRole('button', {
                name: 'actions.submit_for_approval',
            })).toBeInTheDocument();
            expect(screen.getByTestId('vendor-form-request-reason')).toHaveAttribute(
                'aria-required',
                'true',
            );
            fireEvent.click(screen.getByRole('button', {
                name: 'actions.submit_for_approval',
            }));
            expect(updateVendorMock).not.toHaveBeenCalled();
        });

        it('keeps the same owner and an unrelated non-protected edit direct', async () => {
            const onSaved = vi.fn();
            const onApprovalQueued = vi.fn();
            updateVendorMock.mockResolvedValue({
                ...nonProtectedVendor,
                name: 'Ordinary Vendor renamed',
            });
            renderWithQueryClient(
                <VendorForm
                    initialData={nonProtectedVendor}
                    isEdit
                    onSaved={onSaved}
                    onApprovalQueued={onApprovalQueued}
                />,
            );
            await waitFor(() => expect(getVendorOwnersMock).toHaveBeenCalledTimes(1));

            expect(screen.getByTestId('vendor-form-owner')).toHaveValue('7');
            fireEvent.change(screen.getByTestId('vendor-form-name'), {
                target: { value: 'Ordinary Vendor renamed' },
            });
            expect(screen.getByRole('button', { name: 'actions.save' })).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

            await waitFor(() =>
                expect(updateVendorMock).toHaveBeenCalledWith(
                    42,
                    expect.not.objectContaining({
                        outsourcing_owner_user_id: expect.anything(),
                        request_reason: expect.anything(),
                    }),
                ),
            );
            expect(onSaved).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Ordinary Vendor renamed',
                }),
            );
            expect(onApprovalQueued).not.toHaveBeenCalled();
        });

        it('saves a protected Vendor owner reassignment without reason only when both scenarios are disabled', async () => {
            accountabilityScenario.enabled = false;
            accountabilityScenario.protectedVendorEnabled = false;
            const onSaved = vi.fn();
            updateVendorMock.mockResolvedValue({ ...protectedVendor, outsourcing_owner_user_id: 8 });
            renderWithQueryClient(
                <VendorForm initialData={protectedVendor} isEdit onSaved={onSaved} />,
            );
            await waitFor(() => expect(getVendorOwnersMock).toHaveBeenCalledTimes(1));

            fireEvent.change(screen.getByTestId('vendor-form-owner'), { target: { value: '8' } });
            expect(screen.getByRole('button', { name: 'actions.save' })).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

            await waitFor(() => expect(updateVendorMock).toHaveBeenCalledWith(
                42,
                expect.not.objectContaining({ request_reason: expect.anything() }),
            ));
            expect(onSaved).toHaveBeenCalled();
        });

        it.each([
            ['loading', true, false],
            ['error', false, true],
        ])('fails closed while relevant approval scenarios are %s', async (
            _state,
            loading,
            error,
        ) => {
            accountabilityScenario.enabled = false;
            accountabilityScenario.protectedVendorEnabled = false;
            accountabilityScenario.loading = loading;
            accountabilityScenario.error = error;
            renderWithQueryClient(
                <VendorForm initialData={protectedVendor} isEdit onSaved={vi.fn()} />,
            );
            await waitFor(() => expect(getVendorOwnersMock).toHaveBeenCalledTimes(1));

            fireEvent.change(screen.getByTestId('vendor-form-owner'), {
                target: { value: '8' },
            });

            expect(screen.getByRole('button', { name: 'actions.save' })).toBeDisabled();
            expect(updateVendorMock).not.toHaveBeenCalled();
        });
    });
});
