import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClosedLists = vi.fn();
const mockGetProcessOwners = vi.fn();
const mockGetProcessDepartments = vi.fn();
const mockUpdateProcess = vi.fn();
const accountabilityScenario = vi.hoisted(() => ({ enabled: true, error: false, loading: false }));

vi.mock('@/hooks/useAccountabilityReassignmentScenario', () => ({
    useAccountabilityReassignmentScenario: () => ({
        isEnabled: accountabilityScenario.enabled,
        isError: accountabilityScenario.error,
        isLoading: accountabilityScenario.loading,
    }),
}));

vi.mock('@/services/processApi', () => ({
    processApi: {
        getClosedLists: (...args: unknown[]) => mockGetClosedLists(...args),
        updateProcess: (...args: unknown[]) => mockUpdateProcess(...args),
    },
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getProcessOwners: (...args: unknown[]) => mockGetProcessOwners(...args),
        getProcessDepartments: (...args: unknown[]) => mockGetProcessDepartments(...args),
    },
}));

vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

vi.mock('@/components/ui/ThemedSelect', () => ({
    ThemedSelect: ({
        value,
        onValueChange,
        options,
        triggerTestId,
        allowEmpty,
    }: {
        value: string;
        onValueChange: (value: string) => void;
        options: Array<{ value: string; label: string }>;
        triggerTestId?: string;
        allowEmpty?: boolean;
    }) => (
        <select
            data-testid={triggerTestId}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
        >
            {allowEmpty ? <option value="">Not set</option> : null}
            {options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
            ))}
        </select>
    ),
}));

import { ProcessForm } from '@/pages/processes/ProcessForm';
import { apiClient } from '@/services/apiClient';
import { processApprovalQueuedResponseSchema, processSchema } from '@/services/api/schemas';
import type { Process } from '@/types/process';

const protectedProcess: Process = {
    id: 84,
    f_code: 'F-0084',
    l0_area: 'Operations',
    l1_process: 'Payments',
    l2_subprocess: null,
    process_owner_user_id: 7,
    process_owner: {
        name: 'Alice Owner',
        email: 'alice@example.test',
        role_name: 'user',
        department_name: 'Operations',
    },
    owning_department_id: 9,
    owning_department: { name: 'Operations', code: 'OPS' },
    owner_orphaned: false,
    ownership_status: 'assigned',
    derived: {
        cif: 'yes',
        criticality_class: 'critical',
        bcm_check: 'ok',
        linked_asset_count: 0,
        linked_vendor_count: 0,
        is_complete: true,
        is_duplicate: false,
        transitive_vendor_links: [],
        inputs: {
            threshold_critical_score: 16,
            threshold_high_score: 12,
            threshold_medium_score: 8,
            mtpd_critical_hours: 24,
            mtpd_medium_hours: 72,
            criticality_class_source: 'score',
            cif_class_critical: true,
            cif_mtpd_within_critical: false,
            cif_any_impact_maximal: false,
            missing_for_completeness: [],
            manual_vendor_link_count: 0,
            transitive_vendor_pair_count: 0,
        },
    },
    is_archived: false,
    capabilities: {
        can_read: true,
        can_update: true,
        can_archive: true,
        can_restore: false,
        protected_change_requires_approval: true,
        can_request_change: true,
        can_cancel_pending_change: false,
        has_pending_change: false,
        business_edit_blocked: false,
    },
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
};

function renderForm(process: Process = protectedProcess) {
    const onSaved = vi.fn();
    const onApprovalQueued = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter([{
        path: '*',
        element: (
            <ProcessForm
                initialData={process}
                isEdit
                onSaved={onSaved}
                onApprovalQueued={onApprovalQueued}
            />
        ),
    }]);
    render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    return { onSaved, onApprovalQueued };
}

const nonProtectedProcess: Process = {
    ...protectedProcess,
    id: 89,
    derived: {
        ...protectedProcess.derived!,
        cif: 'no',
        criticality_class: 'low',
    },
    capabilities: {
        ...protectedProcess.capabilities!,
        protected_change_requires_approval: false,
        can_request_change: true,
    },
};

function NavigatingProcessEdit() {
    const navigate = useNavigate();
    return (
        <ProcessForm
            initialData={nonProtectedProcess}
            isEdit
            onSaved={(saved) => void navigate(`/processes/${saved.id}`)}
            onApprovalQueued={(queued) => void navigate(`/approvals?tab=mine&approvalId=${queued.approval_id}`)}
            onCancel={() => void navigate('/processes/89')}
        />
    );
}

function renderNavigatingProcessEdit() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter([
        { path: '/processes/89/edit', element: <NavigatingProcessEdit /> },
        { path: '/processes/89', element: <p>Process detail</p> },
        { path: '/approvals', element: <p>Approvals</p> },
    ], { initialEntries: ['/processes/89/edit'] });
    render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    return router;
}

function NavigatingProcessCreate() {
    const navigate = useNavigate();
    return (
        <ProcessForm
            onSaved={(saved) => void navigate(`/processes/${saved.id}`)}
            onCancel={() => void navigate('/processes')}
        />
    );
}

function renderNavigatingProcessCreate() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter([
        { path: '/processes/new', element: <NavigatingProcessCreate /> },
        { path: '/processes', element: <p>Processes</p> },
    ], { initialEntries: ['/processes/new'] });
    render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    return router;
}

describe('ProcessForm governed edit workflow', () => {
    beforeEach(() => {
        accountabilityScenario.enabled = true;
        accountabilityScenario.error = false;
        accountabilityScenario.loading = false;
    });
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetClosedLists.mockResolvedValue({});
        mockGetProcessOwners.mockResolvedValue([]);
        mockGetProcessDepartments.mockResolvedValue([]);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('dirty task protection (#158)', () => {
        it('guards a create draft and becomes clean after an exact semantic revert', async () => {
            const user = userEvent.setup();
            const router = renderNavigatingProcessCreate();
            const name = screen.getByTestId('process-form-l1-process');

            await user.type(name, 'New Process');
            await user.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
            expect(router.state.location.pathname).toBe('/processes/new');
            await user.click(screen.getByRole('button', { name: 'Stay' }));

            await user.clear(name);
            await user.type(name, '  ');
            await user.click(screen.getByRole('button', { name: 'Cancel' }));
            await waitFor(() => expect(router.state.location.pathname).toBe('/processes'));
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        });

        it('prompts for a normalized edit and becomes clean after a semantic revert', async () => {
            const user = userEvent.setup();
            const router = renderNavigatingProcessEdit();
            const name = screen.getByTestId('process-form-l1-process');

            await user.clear(name);
            await user.type(name, 'Changed Payments');
            await user.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
            expect(router.state.location.pathname).toBe('/processes/89/edit');
            await user.click(screen.getByRole('button', { name: 'Stay' }));

            await user.clear(name);
            await user.type(name, '  Payments  ');
            await user.click(screen.getByRole('button', { name: 'Cancel' }));
            await waitFor(() => expect(router.state.location.pathname).toBe('/processes/89'));
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        });

        it('keeps a rejected edit dirty', async () => {
            const user = userEvent.setup();
            mockUpdateProcess.mockRejectedValue(new Error('unavailable'));
            const router = renderNavigatingProcessEdit();

            await user.type(screen.getByTestId('process-form-notes'), 'New note');
            await user.click(screen.getByTestId('process-form-submit'));
            expect(await screen.findByText('Failed to save the process.')).toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: 'Cancel' }));

            expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
            expect(router.state.location.pathname).toBe('/processes/89/edit');
        });

        it('locks edits while pending and accepts a queued response before navigation', async () => {
            const user = userEvent.setup();
            const queued = processApprovalQueuedResponseSchema.parse({
                status: 'approval_required',
                message: 'Submitted',
                approval_id: 98,
                action_type: 'edit',
                pending_fields: ['notes'],
                proposal_id: 'proposal-98',
                proposal_version: 1,
            });
            let resolveUpdate: (value: typeof queued) => void = () => {};
            mockUpdateProcess.mockReturnValue(new Promise((resolve) => {
                resolveUpdate = resolve;
            }));
            const router = renderNavigatingProcessEdit();

            await user.type(screen.getByTestId('process-form-notes'), 'Queued note');
            await user.click(screen.getByTestId('process-form-submit'));
            await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalledTimes(1));
            expect(screen.getByTestId('process-form-l1-process')).toBeDisabled();
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

            await act(async () => resolveUpdate(queued));
            await waitFor(() => expect(router.state.location.pathname).toBe('/approvals'));
            expect(router.state.location.search).toBe('?tab=mine&approvalId=98');
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        });
    });

    it('requires and focuses the request reason before submitting a protected edit', async () => {
        renderForm();
        fireEvent.click(screen.getByTestId('process-form-submit'));

        const reason = screen.getByTestId('process-form-request-reason');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        await waitFor(() => expect(reason).toHaveFocus());
        expect(mockUpdateProcess).not.toHaveBeenCalled();
    });

    it('routes a 202 response to the approval callback without treating it as a saved Process', async () => {
        mockUpdateProcess.mockResolvedValue({
            status: 'approval_required',
            message: 'Submitted',
            approval_id: 41,
            action_type: 'edit',
            pending_fields: ['l1_process'],
            proposal_id: 'proposal-41',
            proposal_version: 1,
        });
        const { onSaved, onApprovalQueued } = renderForm();

        fireEvent.change(screen.getByTestId('process-form-request-reason'), {
            target: { value: 'Improve resilience' },
        });
        fireEvent.click(screen.getByTestId('process-form-submit'));

        await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalledWith(
            84,
            expect.objectContaining({ request_reason: 'Improve resilience' }),
        ));
        expect(onApprovalQueued).toHaveBeenCalledWith(expect.objectContaining({ approval_id: 41 }));
        expect(onSaved).not.toHaveBeenCalled();
    });

    it.each([
        {
            label: 'Process owner',
            testId: 'process-form-owner',
            nextValue: '8',
            configureLookups: () => {
                mockGetProcessOwners.mockResolvedValue([{
                    id: 8,
                    name: 'Bob Owner',
                    email: 'bob@example.test',
                    role_name: 'user',
                    department_id: 10,
                    department_name: 'Finance',
                }]);
            },
        },
        {
            label: 'Owning Department',
            testId: 'process-form-owner-department',
            nextValue: '10',
            configureLookups: () => {
                mockGetProcessDepartments.mockResolvedValue([{
                    id: 10,
                    name: 'Finance',
                    code: 'FIN',
                }]);
            },
        },
    ])('requires and focuses a localized reason for a non-protected $label reassignment', async ({
        testId,
        nextValue,
        configureLookups,
    }) => {
        configureLookups();
        renderForm(nonProtectedProcess);

        await waitFor(() => expect(screen.getByTestId(testId)).toHaveTextContent(
            testId === 'process-form-owner' ? 'Bob Owner' : 'Finance',
        ));
        fireEvent.change(screen.getByTestId(testId), { target: { value: nextValue } });
        expect(screen.getByTestId('process-form-submit')).toHaveTextContent('Submit for approval');
        fireEvent.click(screen.getByTestId('process-form-submit'));

        const reason = screen.getByTestId('process-form-request-reason');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        expect(reason).toHaveFocus();
        expect(screen.getByText(
            'A request reason is required for this governed Process change.',
        )).toBeInTheDocument();
        expect(mockUpdateProcess).not.toHaveBeenCalled();
    });

    it('hands an owner-reassignment 202 response to My Requests without treating it as a direct save', async () => {
        mockGetProcessOwners.mockResolvedValue([{
            id: 8,
            name: 'Bob Owner',
            email: 'bob@example.test',
            role_name: 'user',
            department_id: 10,
            department_name: 'Finance',
        }]);
        mockUpdateProcess.mockResolvedValue(processApprovalQueuedResponseSchema.parse({
            status: 'approval_required',
            message: 'Submitted',
            approval_id: 88,
            action_type: 'edit',
            pending_fields: ['process_owner_user_id'],
            proposal_id: 'proposal-accountability-88',
            proposal_version: 1,
        }));
        const { onSaved, onApprovalQueued } = renderForm(nonProtectedProcess);

        await waitFor(() => expect(screen.getByTestId('process-form-owner')).toHaveTextContent('Bob Owner'));
        fireEvent.change(screen.getByTestId('process-form-owner'), { target: { value: '8' } });
        fireEvent.change(screen.getByTestId('process-form-request-reason'), {
            target: { value: 'Move accountability to the service owner' },
        });
        fireEvent.click(screen.getByTestId('process-form-submit'));

        await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalledWith(
            89,
            expect.objectContaining({
                process_owner_user_id: 8,
                request_reason: 'Move accountability to the service owner',
            }),
        ));
        expect(onApprovalQueued).toHaveBeenCalledWith(expect.objectContaining({
            approval_id: 88,
            proposal_id: 'proposal-accountability-88',
        }));
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('saves an accountability reassignment directly without a reason when the live scenario is disabled', async () => {
        accountabilityScenario.enabled = false;
        mockGetProcessOwners.mockResolvedValue([{
            id: 8,
            name: 'Bob Owner',
            email: 'bob@example.test',
            role_name: 'user',
            department_id: 10,
            department_name: 'Finance',
        }]);
        mockUpdateProcess.mockResolvedValue({ ...nonProtectedProcess, process_owner_user_id: 8 });
        const { onSaved } = renderForm(nonProtectedProcess);

        await waitFor(() => expect(screen.getByTestId('process-form-owner')).toHaveTextContent('Bob Owner'));
        fireEvent.change(screen.getByTestId('process-form-owner'), { target: { value: '8' } });
        expect(screen.getByTestId('process-form-submit')).toHaveTextContent('Save');
        fireEvent.click(screen.getByTestId('process-form-submit'));

        await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalledWith(
            89,
            expect.not.objectContaining({ request_reason: expect.anything() }),
        ));
        expect(onSaved).toHaveBeenCalled();
    });

    it.each([
        ['loading', true, false],
        ['error', false, true],
    ])('blocks accountability submission while the live scenario is %s', async (_state, loading, error) => {
        accountabilityScenario.enabled = false;
        accountabilityScenario.loading = loading;
        accountabilityScenario.error = error;
        mockGetProcessOwners.mockResolvedValue([{
            id: 8,
            name: 'Bob Owner',
            email: 'bob@example.test',
            role_name: 'user',
            department_id: 10,
            department_name: 'Finance',
        }]);
        renderForm(nonProtectedProcess);

        await waitFor(() => expect(screen.getByTestId('process-form-owner')).toHaveTextContent('Bob Owner'));
        fireEvent.change(screen.getByTestId('process-form-owner'), { target: { value: '8' } });
        expect(screen.getByTestId('process-form-submit')).toBeDisabled();
        expect(screen.getByTestId('process-form-submit')).toHaveTextContent('Save');
    });

    it('keeps same-value accountability fields and unrelated non-protected edits on the direct-save path', async () => {
        mockUpdateProcess.mockResolvedValue({
            ...nonProtectedProcess,
            notes: 'Updated without reassignment',
        });
        const { onSaved, onApprovalQueued } = renderForm(nonProtectedProcess);

        expect(screen.getByTestId('process-form-owner')).toHaveValue('7');
        expect(screen.getByTestId('process-form-owner-department')).toHaveValue('9');
        expect(screen.getByTestId('process-form-request-reason')).not.toHaveAttribute('aria-required', 'true');
        fireEvent.change(screen.getByTestId('process-form-notes'), {
            target: { value: 'Updated without reassignment' },
        });
        expect(screen.getByTestId('process-form-submit')).toHaveTextContent('Save');
        fireEvent.click(screen.getByTestId('process-form-submit'));

        await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalledWith(
            89,
            expect.not.objectContaining({ request_reason: expect.anything() }),
        ));
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
            notes: 'Updated without reassignment',
        }));
        expect(onApprovalQueued).not.toHaveBeenCalled();
    });

    it('allows a current CIF Process to save directly when the protected scenario is disabled', async () => {
        const disabledProcess: Process = {
            ...protectedProcess,
            capabilities: {
                ...protectedProcess.capabilities!,
                protected_change_requires_approval: false,
                can_request_change: true,
            },
        };
        mockUpdateProcess.mockResolvedValue({ ...disabledProcess, notes: 'Direct save' });
        const { onSaved } = renderForm(disabledProcess);

        expect(screen.getByTestId('process-form-submit')).toHaveTextContent('Save');
        fireEvent.click(screen.getByTestId('process-form-submit'));

        await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalledWith(
            84,
            expect.not.objectContaining({ request_reason: expect.anything() }),
        ));
        expect(onSaved).toHaveBeenCalled();
    });

    it.each([
        { enabled: true, expectedRequest: true },
        { enabled: false, expectedRequest: false },
    ])('uses backend scenario routing for a proposed CIF Process: $enabled', async ({ enabled, expectedRequest }) => {
        const candidate: Process = {
            ...protectedProcess,
            id: 85,
            cif_override: 'no',
            derived: { ...protectedProcess.derived!, cif: 'no' },
            capabilities: {
                ...protectedProcess.capabilities!,
                protected_change_requires_approval: enabled,
                can_request_change: true,
            },
        };
        mockUpdateProcess.mockResolvedValue({ ...candidate, cif_override: 'yes' });
        renderForm(candidate);

        fireEvent.change(screen.getByTestId('process-form-cif-override'), {
            target: { value: 'yes' },
        });
        fireEvent.click(screen.getByTestId('process-form-submit'));

        if (expectedRequest) {
            expect(screen.getByTestId('process-form-request-reason')).toHaveFocus();
            expect(mockUpdateProcess).not.toHaveBeenCalled();
        } else {
            await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalledWith(
                85,
                expect.not.objectContaining({ request_reason: expect.anything() }),
            ));
        }
    });

    it('uses the parsed nested conflict code to show the specific pending-change error', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({
                    detail: {
                        code: 'process_pending_mutation',
                        message: 'A governed Process change is already pending',
                    },
                }), {
                    status: 409,
                    headers: { 'Content-Type': 'application/json' },
                }),
            ),
        );
        mockUpdateProcess.mockImplementation((processId, payload) => apiClient.patch(
            `/processes/${String(processId)}`,
            payload,
            { schema: processSchema },
        ));
        renderForm();

        fireEvent.change(screen.getByTestId('process-form-request-reason'), {
            target: { value: 'Second request' },
        });
        fireEvent.click(screen.getByTestId('process-form-submit'));

        expect(await screen.findByText(
            'This Process already has a pending change. Cancel or resolve it before submitting another.',
        )).toBeInTheDocument();
    });

    it('honors a nested server reason requirement outside the local heuristic and retries the same edit', async () => {
        const scoreDerivedCandidate: Process = {
            ...protectedProcess,
            id: 86,
            impact_client: null,
            impact_market_operations: null,
            impact_regulatory: null,
            impact_financial: null,
            mtpd_hours: null,
            preliminary_criticality: 'low',
            cif_override: null,
            notes: 'Original note',
            derived: {
                ...protectedProcess.derived!,
                cif: 'no',
                criticality_class: 'low',
                inputs: {
                    ...protectedProcess.derived!.inputs,
                    criticality_class_source: 'score',
                    cif_class_critical: false,
                    cif_mtpd_within_critical: false,
                    cif_any_impact_maximal: false,
                },
            },
        };
        mockGetClosedLists.mockResolvedValue({ Skala15: [1, 2, 3, 4, 5] });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                detail: {
                    code: 'governed_mutation_reason_required',
                    message: 'A request reason is mandatory for this governed Process change',
                },
            }), {
                status: 422,
                headers: { 'Content-Type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                status: 'approval_required',
                message: 'Submitted',
                approval_id: 42,
                action_type: 'edit',
                pending_fields: [
                    'impact_client',
                    'impact_market_operations',
                    'impact_regulatory',
                    'impact_financial',
                    'mtpd_hours',
                ],
                proposal_id: 'proposal-42',
                proposal_version: 1,
            }), {
                status: 202,
                headers: { 'Content-Type': 'application/json' },
            }));
        vi.stubGlobal('fetch', fetchMock);
        mockUpdateProcess.mockImplementation((processId, payload) => apiClient.patch(
            `/processes/${String(processId)}`,
            payload,
            { schema: processSchema.or(processApprovalQueuedResponseSchema) },
        ));
        const { onSaved, onApprovalQueued } = renderForm(scoreDerivedCandidate);

        await waitFor(() => expect(screen.getByTestId('process-form-impact-client')).toHaveTextContent('4'));
        for (const testId of [
            'process-form-impact-client',
            'process-form-impact-market-operations',
            'process-form-impact-regulatory',
            'process-form-impact-financial',
        ]) {
            fireEvent.change(screen.getByTestId(testId), { target: { value: '4' } });
        }
        fireEvent.change(screen.getByTestId('process-form-mtpd-hours'), { target: { value: '48' } });
        fireEvent.change(screen.getByTestId('process-form-notes'), { target: { value: 'Preserved note' } });

        expect(screen.getByTestId('process-form-submit')).toHaveTextContent('Save');
        fireEvent.click(screen.getByTestId('process-form-submit'));

        expect(await screen.findByText(
            'A request reason is required for this governed Process change.',
        )).toBeInTheDocument();
        const reason = screen.getByTestId('process-form-request-reason');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        await waitFor(() => expect(reason).toHaveFocus());
        expect(screen.getByTestId('process-form-submit')).toHaveTextContent('Submit for approval');
        expect(screen.getByTestId('process-form-impact-client')).toHaveValue('4');
        expect(screen.getByTestId('process-form-mtpd-hours')).toHaveValue(48);
        expect(screen.getByTestId('process-form-notes')).toHaveValue('Preserved note');

        fireEvent.change(screen.getByTestId('process-form-notes'), {
            target: { value: 'Preserved after server response' },
        });
        expect(screen.getByTestId('process-form-submit')).toHaveTextContent('Submit for approval');
        fireEvent.change(reason, { target: { value: 'Score-derived CIF requires review' } });
        expect(screen.getByTestId('process-form-submit')).toHaveTextContent('Submit for approval');
        fireEvent.click(screen.getByTestId('process-form-submit'));

        await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalledTimes(2));
        expect(mockUpdateProcess).toHaveBeenLastCalledWith(86, expect.objectContaining({
            impact_client: 4,
            impact_market_operations: 4,
            impact_regulatory: 4,
            impact_financial: 4,
            mtpd_hours: 48,
            notes: 'Preserved after server response',
            request_reason: 'Score-derived CIF requires review',
        }));
        expect(onApprovalQueued).toHaveBeenCalledWith(expect.objectContaining({ approval_id: 42 }));
        expect(onSaved).not.toHaveBeenCalled();
        expect(screen.getByTestId('process-form-submit')).toHaveTextContent('Save');
    });
});
