/**
 * FR-P2b-1/2/3/5 (spec N11–N13, findings C1/C4/C5) — AssetForm migrated to the
 * accessible `Field` primitive with the locked validation model: native
 * `required` kept + `noValidate` on the form + per-field JS validation that
 * focuses the first invalid control, exposes `aria-invalid`, and renders a
 * `role="alert"` summary. Also covers reading `.isError` on the in-form
 * closed-lists fetch (C4) so a dropped request is not a silent empty dropdown.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter, useNavigate } from 'react-router-dom';
import * as axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClosedLists = vi.fn();
const mockCreateAsset = vi.fn();
const mockUpdateAsset = vi.fn();
const mockGetAssetOwners = vi.fn();
const mockGetAssetDepartments = vi.fn();
const accountabilityScenario = vi.hoisted(() => ({
    enabled: true,
    error: false,
    loading: false,
    protectedAssetEnabled: false,
}));

vi.mock('@/hooks/useAccountabilityReassignmentScenario', () => ({
    useAccountabilityReassignmentScenario: () => ({
        isEnabled: accountabilityScenario.enabled,
        isError: accountabilityScenario.error,
        isLoading: accountabilityScenario.loading,
        requiresApproval: (key: string) => (
            key === 'accountability_reassignment'
                ? accountabilityScenario.enabled
                : key === 'protected_asset_edit' && accountabilityScenario.protectedAssetEnabled
        ),
    }),
}));

vi.mock('@/services/assetApi', () => ({
    assetApi: {
        getClosedLists: (...args: unknown[]) => mockGetClosedLists(...args),
        createAsset: (...args: unknown[]) => mockCreateAsset(...args),
        updateAsset: (...args: unknown[]) => mockUpdateAsset(...args),
    },
}));
vi.mock('@/services/logger', () => ({ logError: vi.fn() }));
vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getAssetOwners: (...args: unknown[]) => mockGetAssetOwners(...args),
        getAssetDepartments: (...args: unknown[]) => mockGetAssetDepartments(...args),
    },
}));

import { AssetForm } from '@/pages/assets/AssetForm';
import i18n from '@/i18n';
import { processApprovalQueuedResponseSchema } from '@/services/api/schemas';
import type { Asset } from '@/types/asset';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(node: Element): Promise<void> {
    const results = await axe.run(node, {
        runOnly: { type: 'tag', values: AXE_TAGS },
        rules: { 'color-contrast': { enabled: false } },
    });
    const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`).join('\n');
    expect(summary, summary).toBe('');
}

async function renderForm(initialData?: Asset) {
    const onSaved = vi.fn();
    const onApprovalQueued = vi.fn();
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const router = createMemoryRouter([{
        path: '*',
        element: (
            <AssetForm
                initialData={initialData}
                isEdit={initialData !== undefined}
                onApprovalQueued={onApprovalQueued}
                onSaved={onSaved}
            />
        ),
    }]);
    const utils = render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    await waitFor(() => {
        expect(mockGetClosedLists).toHaveBeenCalledTimes(1);
        expect(mockGetAssetOwners).toHaveBeenCalledTimes(2);
        expect(mockGetAssetDepartments).toHaveBeenCalledTimes(1);
    });
    return { onApprovalQueued, onSaved, ...utils };
}

const nameLabel = () => i18n.t('assets:form.name');

beforeEach(() => {
    vi.clearAllMocks();
    accountabilityScenario.enabled = true;
    accountabilityScenario.error = false;
    accountabilityScenario.loading = false;
    accountabilityScenario.protectedAssetEnabled = false;
    mockGetClosedLists.mockResolvedValue({});
    mockGetAssetOwners.mockResolvedValue([{
        id: 11, name: 'Alex Owner', email: 'alex@example.test', role_name: 'business_owner',
        department_id: 4, department_name: 'Operations',
    }]);
    mockGetAssetDepartments.mockResolvedValue([{ id: 4, name: 'Operations', code: 'OPS' }]);
});

async function fillRequiredOwnership() {
    await waitFor(() => expect(mockGetAssetOwners).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByTestId('asset-form-business-owner'));
    fireEvent.click(await screen.findByRole('option', { name: /Alex Owner/ }));
    fireEvent.click(screen.getByTestId('asset-form-ict-owner'));
    fireEvent.click(await screen.findByRole('option', { name: /Alex Owner/ }));
}

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('AssetForm — Field migration + validation (#59)', () => {
    it('associates the required name control with its label and exposes aria-required', async () => {
        await renderForm();
        const name = screen.getByRole('textbox', { name: nameLabel() });
        expect(name).toHaveAttribute('aria-required', 'true');
        expect(name).not.toHaveAttribute('aria-invalid');
    });

    it('on invalid submit: focuses the first invalid field, sets aria-invalid, and shows a role=alert summary', async () => {
        const user = userEvent.setup();
        await renderForm();

        await user.click(screen.getByTestId('asset-form-submit'));

        const name = screen.getByRole('textbox', { name: nameLabel() });
        expect(name).toHaveAttribute('aria-invalid', 'true');
        expect(name).toHaveFocus();

        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(i18n.t('assets:form.errors.fix_fields'));
        expect(screen.getByText(i18n.t('assets:form.errors.name_required'))).toBeInTheDocument();
        expect(mockCreateAsset).not.toHaveBeenCalled();
    });

    it('submits successfully once the required field is filled', async () => {
        const user = userEvent.setup();
        mockCreateAsset.mockResolvedValue({ id: 7, name: 'Payroll DB' });
        const { onSaved } = await renderForm();

        await user.type(screen.getByRole('textbox', { name: nameLabel() }), 'Payroll DB');
        await fillRequiredOwnership();
        await user.click(screen.getByTestId('asset-form-submit'));

        await waitFor(() => expect(mockCreateAsset).toHaveBeenCalledTimes(1));
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(mockCreateAsset).toHaveBeenCalledWith(expect.objectContaining({
            business_owner_user_id: 11,
            ict_owner_user_id: 11,
            owning_department_id: 4,
        }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('surfaces the save-failed banner when the request rejects', async () => {
        mockCreateAsset.mockRejectedValue(new Error('boom'));
        await renderForm();

        fireEvent.change(screen.getByRole('textbox', { name: nameLabel() }), {
            target: { value: 'Payroll DB' },
        });
        await fillRequiredOwnership();
        fireEvent.click(screen.getByTestId('asset-form-submit'));

        expect(await screen.findByText(i18n.t('assets:form.errors.save_failed'))).toBeInTheDocument();
    });

    it('reads .isError on the closed-lists fetch — a retryable notice, not a silent empty dropdown', async () => {
        mockGetClosedLists.mockRejectedValue(new Error('network down'));
        await renderForm();

        expect(await screen.findByText(i18n.t('assets:form.errors.lists_failed'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: i18n.t('assets:actions.retry') })).toBeInTheDocument();
    });

    it('has no axe violations in the validation-error state (N10)', async () => {
        const user = userEvent.setup();
        const { container } = await renderForm();

        await user.click(screen.getByTestId('asset-form-submit'));
        expect(screen.getByRole('alert')).toBeInTheDocument();

        await expectNoAxeViolations(container);
    });
});

describe('AssetForm — ownership acceptance (#75)', () => {
    beforeEach(() => {
        mockGetAssetOwners.mockResolvedValue([
            {
                id: 11, name: 'Alex Owner', email: 'alex@example.test', role_name: 'business_owner',
                department_id: 4, department_name: 'Operations',
            },
            {
                id: 22, name: 'Taylor Owner', email: 'taylor@example.test', role_name: 'ict_owner',
                department_id: 9, department_name: 'IT',
            },
            {
                id: 33, name: 'Casey Owner', email: 'casey@example.test', role_name: 'asset_owner',
                department_id: 8, department_name: 'Finance',
            },
        ]);
        mockGetAssetDepartments.mockResolvedValue([
            { id: 4, name: 'Operations', code: 'OPS' },
            { id: 8, name: 'Finance', code: 'FIN' },
            { id: 9, name: 'IT', code: 'IT' },
        ]);
    });

    it('fills an empty Department from Business Owner', async () => {
        const user = userEvent.setup();
        await renderForm();

        const department = screen.getByTestId('asset-form-owner-department');
        expect(department).toHaveTextContent(/^$/);
        await user.click(screen.getByTestId('asset-form-business-owner'));
        const operationsOwner = await screen.findByRole('option', { name: /Alex Owner.*Operations/ });
        expect(operationsOwner).toHaveTextContent('Operations');
        await user.click(operationsOwner);
        expect(department).toHaveTextContent('Operations (OPS)');
    });

    it('keeps the Business Owner Department when ICT Owner changes and submits the selected ownership', async () => {
        mockCreateAsset.mockResolvedValue({ id: 75, name: 'Cross-department service' });
        await renderForm();
        fireEvent.change(screen.getByRole('textbox', { name: nameLabel() }), {
            target: { value: 'Cross-department service' },
        });

        const department = screen.getByTestId('asset-form-owner-department');
        fireEvent.click(screen.getByTestId('asset-form-business-owner'));
        fireEvent.click(await screen.findByRole('option', { name: /Alex Owner.*Operations/ }));
        expect(department).toHaveTextContent('Operations (OPS)');

        fireEvent.click(screen.getByTestId('asset-form-ict-owner'));
        const financeOwner = await screen.findByRole('option', { name: /Casey Owner.*Finance/ });
        expect(financeOwner).toHaveTextContent('Finance');
        fireEvent.click(financeOwner);
        expect(department).toHaveTextContent('Operations (OPS)');

        fireEvent.click(screen.getByTestId('asset-form-submit'));
        await waitFor(() => expect(mockCreateAsset).toHaveBeenCalledTimes(1));
        expect(mockCreateAsset).toHaveBeenCalledWith(expect.objectContaining({
            business_owner_user_id: 11,
            ict_owner_user_id: 33,
            owning_department_id: 4,
        }));
    });

    it('preserves a manually selected Department across Business Owner changes', async () => {
        mockCreateAsset.mockResolvedValue({ id: 76, name: 'Manual-department service' });
        await renderForm();
        fireEvent.change(screen.getByRole('textbox', { name: nameLabel() }), {
            target: { value: 'Manual-department service' },
        });

        const department = screen.getByTestId('asset-form-owner-department');
        await waitFor(() => expect(department).toBeEnabled());
        fireEvent.click(department);
        fireEvent.click(await screen.findByRole('option', { name: 'Finance (FIN)' }));

        const businessOwner = screen.getByTestId('asset-form-business-owner');
        await waitFor(() => expect(businessOwner).toBeEnabled());
        fireEvent.click(businessOwner);
        const operationsOwner = await screen.findByRole('option', { name: /Alex Owner.*Operations/ });
        expect(operationsOwner).toHaveTextContent('Operations');
        fireEvent.click(operationsOwner);
        expect(department).toHaveTextContent('Finance (FIN)');

        fireEvent.click(businessOwner);
        const itOwner = await screen.findByRole('option', { name: /Taylor Owner.*IT/ });
        expect(itOwner).toHaveTextContent('IT');
        fireEvent.click(itOwner);
        expect(department).toHaveTextContent('Finance (FIN)');

        const ictOwner = screen.getByTestId('asset-form-ict-owner');
        await waitFor(() => expect(ictOwner).toBeEnabled());
        fireEvent.click(ictOwner);
        const financeOwner = await screen.findByRole('option', { name: /Casey Owner.*Finance/ });
        expect(financeOwner).toHaveTextContent('Finance');
        fireEvent.click(financeOwner);
        expect(department).toHaveTextContent('Finance (FIN)');

        fireEvent.click(screen.getByTestId('asset-form-submit'));
        await waitFor(() => expect(mockCreateAsset).toHaveBeenCalledTimes(1));
        expect(mockCreateAsset).toHaveBeenCalledWith(expect.objectContaining({
            business_owner_user_id: 22,
            ict_owner_user_id: 33,
            owning_department_id: 8,
        }));
    });
});

const nonProtectedAsset: Asset = {
    id: 88,
    name: 'Payments platform',
    business_owner_user_id: 11,
    business_owner: {
        name: 'Alex Owner',
        role_name: 'business_owner',
        department_name: 'Operations',
    },
    ict_owner_user_id: 22,
    ict_owner: {
        name: 'Taylor Owner',
        role_name: 'ict_owner',
        department_name: 'IT',
    },
    owning_department_id: 4,
    owning_department: { name: 'Operations', code: 'OPS' },
    business_owner_orphaned: false,
    ict_owner_orphaned: false,
    ownership_status: 'assigned',
    notes: 'Existing note',
    derived: {
        h_rank: 1,
        article8_classification: 'other',
        cif: 'no',
        cif_process_count: 0,
        cif_process_names: [],
        spof: 'no',
        external_dependency: 'no',
        legacy: 'no',
        linked_process_count: 0,
        linked_vendor_count: 0,
        linked_asset_names: [],
        vendor_names: [],
        ict_service_codes: [],
        contract_references: [],
        is_complete: true,
        inputs: {
            reference_date: '2026-07-30',
            threshold_low_score: 4,
            threshold_medium_score: 8,
            threshold_high_score: 12,
            rank_primary_process_criticality: 0,
            rank_score_criticality: 1,
            rank_preliminary_criticality: 0,
            rank_business_criticality: 0,
            rank_cif_floor: 0,
            missing_for_completeness: [],
        },
    },
    is_archived: false,
    capabilities: {
        can_read: true,
        can_update: true,
        can_archive: true,
        can_restore: false,
        has_pending_change: false,
        business_edit_blocked: false,
        can_cancel_pending_change: false,
    },
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
};
const protectedAsset = {
    ...nonProtectedAsset,
    derived: {
        ...nonProtectedAsset.derived,
        resulting_criticality: 'critical',
    },
} as Asset;

function NavigatingAssetEdit() {
    const navigate = useNavigate();
    return (
        <AssetForm
            initialData={nonProtectedAsset}
            isEdit
            onSaved={(saved) => void navigate(`/assets/${saved.id}`)}
            onApprovalQueued={(queued) => void navigate(`/approvals?tab=mine&approvalId=${queued.approval_id}`)}
            onCancel={() => void navigate('/assets/88')}
        />
    );
}

async function renderNavigatingAssetEdit() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const router = createMemoryRouter([
        { path: '/assets/88/edit', element: <NavigatingAssetEdit /> },
        { path: '/assets/88', element: <p>Asset detail</p> },
        { path: '/approvals', element: <p>Approvals</p> },
    ], { initialEntries: ['/assets/88/edit'] });
    render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    await waitFor(() => {
        expect(mockGetClosedLists).toHaveBeenCalledTimes(1);
        expect(mockGetAssetOwners).toHaveBeenCalledTimes(2);
        expect(mockGetAssetDepartments).toHaveBeenCalledTimes(1);
    });
    return router;
}

function NavigatingAssetCreate() {
    const navigate = useNavigate();
    return (
        <AssetForm
            onSaved={(saved) => void navigate(`/assets/${saved.id}`)}
            onCancel={() => void navigate('/assets')}
        />
    );
}

async function renderNavigatingAssetCreate() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter([
        { path: '/assets/new', element: <NavigatingAssetCreate /> },
        { path: '/assets', element: <p>Assets</p> },
    ], { initialEntries: ['/assets/new'] });
    render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    await waitFor(() => {
        expect(mockGetClosedLists).toHaveBeenCalledTimes(1);
        expect(mockGetAssetOwners).toHaveBeenCalledTimes(2);
        expect(mockGetAssetDepartments).toHaveBeenCalledTimes(1);
    });
    return router;
}

describe('AssetForm — governed accountability edits (#88)', () => {
    beforeEach(() => {
        mockGetAssetOwners.mockResolvedValue([
            {
                id: 11, name: 'Alex Owner', email: 'alex@example.test', role_name: 'business_owner',
                department_id: 4, department_name: 'Operations',
            },
            {
                id: 22, name: 'Taylor Owner', email: 'taylor@example.test', role_name: 'ict_owner',
                department_id: 9, department_name: 'IT',
            },
            {
                id: 33, name: 'Casey Owner', email: 'casey@example.test', role_name: 'asset_owner',
                department_id: 8, department_name: 'Finance',
            },
        ]);
        mockGetAssetDepartments.mockResolvedValue([
            { id: 4, name: 'Operations', code: 'OPS' },
            { id: 8, name: 'Finance', code: 'FIN' },
            { id: 9, name: 'IT', code: 'IT' },
        ]);
    });

    describe('dirty task protection (#158)', () => {
        it('guards a create draft and becomes clean after an exact semantic revert', async () => {
            const user = userEvent.setup();
            const router = await renderNavigatingAssetCreate();
            const name = screen.getByTestId('asset-form-name');

            await user.type(name, 'New Asset');
            await user.click(screen.getByRole('button', { name: i18n.t('assets:actions.cancel') }));
            expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
            expect(router.state.location.pathname).toBe('/assets/new');
            await user.click(screen.getByRole('button', { name: i18n.t('common:actions.stay') }));

            await user.clear(name);
            await user.type(name, '  ');
            await user.click(screen.getByRole('button', { name: i18n.t('assets:actions.cancel') }));
            await waitFor(() => expect(router.state.location.pathname).toBe('/assets'));
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        });

        it('prompts for a normalized edit and becomes clean after a semantic revert', async () => {
            const user = userEvent.setup();
            const router = await renderNavigatingAssetEdit();
            const name = screen.getByTestId('asset-form-name');

            fireEvent.change(name, { target: { value: 'Changed platform' } });
            await user.click(screen.getByRole('button', { name: i18n.t('assets:actions.cancel') }));
            expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
            expect(router.state.location.pathname).toBe('/assets/88/edit');
            await user.click(screen.getByRole('button', { name: i18n.t('common:actions.stay') }));

            fireEvent.change(name, { target: { value: '  Payments platform  ' } });
            await user.click(screen.getByRole('button', { name: i18n.t('assets:actions.cancel') }));
            await waitFor(() => expect(router.state.location.pathname).toBe('/assets/88'));
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        });

        it('keeps a rejected edit dirty', async () => {
            const user = userEvent.setup();
            mockUpdateAsset.mockRejectedValue(new Error('unavailable'));
            const router = await renderNavigatingAssetEdit();

            fireEvent.change(screen.getByTestId('asset-form-notes'), { target: { value: 'New note' } });
            await user.click(screen.getByTestId('asset-form-submit'));
            expect(await screen.findByText(i18n.t('assets:form.errors.save_failed'))).toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: i18n.t('assets:actions.cancel') }));

            expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
            expect(router.state.location.pathname).toBe('/assets/88/edit');
        });

        it('locks edits while pending and accepts a queued response before navigation', async () => {
            const user = userEvent.setup();
            const queued = processApprovalQueuedResponseSchema.parse({
                status: 'approval_required',
                message: 'Submitted',
                approval_id: 99,
                action_type: 'edit',
                pending_fields: ['notes'],
                proposal_id: 'proposal-asset-99',
                proposal_version: 1,
            });
            let resolveUpdate: (value: typeof queued) => void = () => {};
            mockUpdateAsset.mockReturnValue(new Promise((resolve) => {
                resolveUpdate = resolve;
            }));
            const router = await renderNavigatingAssetEdit();

            await user.type(screen.getByTestId('asset-form-notes'), 'Queued note');
            await user.click(screen.getByTestId('asset-form-submit'));
            await waitFor(() => expect(mockUpdateAsset).toHaveBeenCalledTimes(1));
            expect(screen.getByTestId('asset-form-name')).toBeDisabled();
            expect(screen.getByRole('button', { name: i18n.t('assets:actions.cancel') })).toBeDisabled();

            await act(async () => resolveUpdate(queued));
            await waitFor(() => expect(router.state.location.pathname).toBe('/approvals'));
            expect(router.state.location.search).toBe('?tab=mine&approvalId=99');
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        });
    });

    it.each([
        {
            label: 'Business Owner',
            testId: 'asset-form-business-owner',
            option: /Casey Owner.*Finance/,
        },
        {
            label: 'ICT Owner',
            testId: 'asset-form-ict-owner',
            option: /Casey Owner.*Finance/,
        },
        {
            label: 'Owning Department',
            testId: 'asset-form-owner-department',
            option: 'Finance (FIN)',
        },
    ])('requires and focuses a localized reason for an actual $label delta', async ({
        testId,
        option,
    }) => {
        const { container } = await renderForm(nonProtectedAsset);

        const trigger = screen.getByTestId(testId);
        await waitFor(() => expect(trigger).toBeEnabled());
        fireEvent.click(trigger);
        fireEvent.click(await screen.findByRole('option', { name: option }));
        expect(screen.getByTestId('asset-form-submit')).toHaveTextContent(
            i18n.t('assets:actions.submit_for_approval'),
        );
        fireEvent.click(screen.getByTestId('asset-form-submit'));

        const reason = screen.getByTestId('asset-form-request-reason');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        expect(reason).toHaveFocus();
        expect(screen.getByText(i18n.t('assets:form.errors.request_reason_required'))).toBeInTheDocument();
        expect(mockUpdateAsset).not.toHaveBeenCalled();
        await expectNoAxeViolations(container);
    });

    it('hands a typed Business Owner reassignment 202 to the existing approval callback', async () => {
        mockUpdateAsset.mockResolvedValue(processApprovalQueuedResponseSchema.parse({
            status: 'approval_required',
            message: 'Submitted',
            approval_id: 88,
            action_type: 'edit',
            pending_fields: ['business_owner_user_id'],
            proposal_id: 'proposal-asset-accountability-88',
            proposal_version: 1,
        }));
        const { onApprovalQueued, onSaved } = await renderForm(nonProtectedAsset);

        const businessOwner = screen.getByTestId('asset-form-business-owner');
        await waitFor(() => expect(businessOwner).toBeEnabled());
        fireEvent.click(businessOwner);
        fireEvent.click(await screen.findByRole('option', { name: /Casey Owner.*Finance/ }));
        fireEvent.change(screen.getByTestId('asset-form-request-reason'), {
            target: { value: 'Transfer accountability to the service owner' },
        });
        fireEvent.click(screen.getByTestId('asset-form-submit'));

        await waitFor(() => expect(mockUpdateAsset).toHaveBeenCalledWith(
            88,
            expect.objectContaining({
                business_owner_user_id: 33,
                request_reason: 'Transfer accountability to the service owner',
            }),
        ));
        expect(onApprovalQueued).toHaveBeenCalledWith(expect.objectContaining({
            approval_id: 88,
            proposal_id: 'proposal-asset-accountability-88',
        }));
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('requires approval when protected Asset governance is enabled but accountability governance is disabled', async () => {
        accountabilityScenario.enabled = false;
        accountabilityScenario.protectedAssetEnabled = true;
        const user = userEvent.setup();
        await renderForm(protectedAsset);

        await user.click(screen.getByTestId('asset-form-business-owner'));
        await user.click(await screen.findByRole('option', { name: /Casey Owner.*Finance/ }));

        expect(screen.getByTestId('asset-form-submit')).toHaveTextContent(
            i18n.t('assets:actions.submit_for_approval'),
        );
        expect(screen.getByTestId('asset-form-request-reason')).toHaveAttribute('aria-required', 'true');
        await user.click(screen.getByTestId('asset-form-submit'));
        expect(mockUpdateAsset).not.toHaveBeenCalled();
    });

    it('keeps same-value accountability fields and an unrelated non-protected edit direct', async () => {
        const user = userEvent.setup();
        mockUpdateAsset.mockResolvedValue({
            ...nonProtectedAsset,
            notes: 'Updated without reassignment',
        });
        const { onApprovalQueued, onSaved } = await renderForm(nonProtectedAsset);

        expect(screen.getByTestId('asset-form-business-owner')).toHaveTextContent('Alex Owner');
        expect(screen.getByTestId('asset-form-ict-owner')).toHaveTextContent('Taylor Owner');
        expect(screen.getByTestId('asset-form-owner-department')).toHaveTextContent('Operations (OPS)');
        expect(screen.getByTestId('asset-form-request-reason')).not.toHaveAttribute('aria-required', 'true');
        await user.clear(screen.getByTestId('asset-form-notes'));
        await user.type(screen.getByTestId('asset-form-notes'), 'Updated without reassignment');
        expect(screen.getByTestId('asset-form-submit')).toHaveTextContent(i18n.t('assets:actions.save'));
        await user.click(screen.getByTestId('asset-form-submit'));

        await waitFor(() => expect(mockUpdateAsset).toHaveBeenCalledWith(
            88,
            expect.not.objectContaining({ request_reason: expect.anything() }),
        ));
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
            notes: 'Updated without reassignment',
        }));
        expect(onApprovalQueued).not.toHaveBeenCalled();
    });

    it('saves a protected Asset accountability reassignment without reason only when both scenarios are disabled', async () => {
        accountabilityScenario.enabled = false;
        accountabilityScenario.protectedAssetEnabled = false;
        const user = userEvent.setup();
        mockUpdateAsset.mockResolvedValue({ ...protectedAsset, business_owner_user_id: 33 });
        const { onSaved } = await renderForm(protectedAsset);

        await user.click(screen.getByTestId('asset-form-business-owner'));
        await user.click(await screen.findByRole('option', { name: /Casey Owner.*Finance/ }));
        expect(screen.getByTestId('asset-form-submit')).toHaveTextContent(i18n.t('assets:actions.save'));
        await user.click(screen.getByTestId('asset-form-submit'));

        await waitFor(() => expect(mockUpdateAsset).toHaveBeenCalledWith(
            88,
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
        accountabilityScenario.protectedAssetEnabled = false;
        accountabilityScenario.loading = loading;
        accountabilityScenario.error = error;
        const user = userEvent.setup();
        await renderForm(protectedAsset);

        await user.click(screen.getByTestId('asset-form-business-owner'));
        await user.click(await screen.findByRole('option', { name: /Casey Owner.*Finance/ }));

        expect(screen.getByTestId('asset-form-submit')).toBeDisabled();
        expect(mockUpdateAsset).not.toHaveBeenCalled();
    });
});
