import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClosedLists = vi.fn();
const mockGetProcessOwners = vi.fn();
const mockGetProcessDepartments = vi.fn();
const mockUpdateProcess = vi.fn();

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
    render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <ProcessForm
                    initialData={process}
                    isEdit
                    onSaved={onSaved}
                    onApprovalQueued={onApprovalQueued}
                />
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { onSaved, onApprovalQueued };
}

describe('ProcessForm protected edit workflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetClosedLists.mockResolvedValue({});
        mockGetProcessOwners.mockResolvedValue([]);
        mockGetProcessDepartments.mockResolvedValue([]);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('requires and focuses the request reason before submitting a protected edit', async () => {
        renderForm();
        fireEvent.click(screen.getByTestId('process-form-submit'));

        const reason = screen.getByTestId('process-form-request-reason');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        expect(reason).toHaveFocus();
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
            'A request reason is required for a protected Process change.',
        )).toBeInTheDocument();
        const reason = screen.getByTestId('process-form-request-reason');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        expect(reason).toHaveFocus();
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
