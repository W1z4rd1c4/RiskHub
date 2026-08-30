/**
 * FR-P2b-1/2/4/5 (spec N11–N13, findings C1/C5/S11) — ThreatForm migrated to
 * `Field` with native `required` + `noValidate` + per-field validation, plus
 * regained submit feedback (button disables while pending). The name field is
 * required with a per-field error, aria-invalid, focus-first-invalid and a
 * `role="alert"` summary.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    RouterProvider,
    createMemoryRouter,
    useNavigate,
} from 'react-router-dom';
import * as axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetThreatStewards = vi.fn();
const mockCreateThreat = vi.fn();
const mockUpdateThreat = vi.fn();
const accountabilityScenario = vi.hoisted(() => ({ enabled: true }));

vi.mock('@/hooks/useAccountabilityReassignmentScenario', () => ({
    useAccountabilityReassignmentScenario: () => ({
        isEnabled: accountabilityScenario.enabled,
        isError: false,
        isLoading: false,
    }),
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getThreatStewards: (...args: unknown[]) => mockGetThreatStewards(...args),
    },
}));
vi.mock('@/services/threatApi', () => ({
    threatApi: {
        createThreat: (...args: unknown[]) => mockCreateThreat(...args),
        updateThreat: (...args: unknown[]) => mockUpdateThreat(...args),
    },
}));
vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

import { ThreatForm } from '@/pages/threats/ThreatForm';
import i18n from '@/i18n';
import { approvalCreatedResponseSchema } from '@/services/api/schemas';
import type { Threat } from '@/types/threat';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(node: Element): Promise<void> {
    const results = await axe.run(node, {
        runOnly: { type: 'tag', values: AXE_TAGS },
        rules: { 'color-contrast': { enabled: false } },
    });
    const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`).join('\n');
    expect(summary, summary).toBe('');
}

function renderForm(initialData?: Threat, onCancel?: () => void) {
    const onSaved = vi.fn();
    const onApprovalQueued = vi.fn();
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const router = createMemoryRouter([
        {
            path: '/',
            element: (
                <ThreatForm
                    initialData={initialData}
                    isEdit={initialData !== undefined}
                    onApprovalQueued={onApprovalQueued}
                    onSaved={onSaved}
                    onCancel={onCancel}
                />
            ),
        },
    ]);
    const utils = render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    return { onApprovalQueued, onSaved, ...utils };
}

const nameLabel = () => i18n.t('threats:form.name');

beforeEach(() => {
    vi.clearAllMocks();
    accountabilityScenario.enabled = true;
    mockGetThreatStewards.mockResolvedValue([
        { id: 17, name: 'Clara Security', email: 'ciso@test.local' },
        { id: 18, name: 'Diego Security', email: 'diego@test.local' },
    ]);
});

const nonProtectedThreat = {
    id: 88,
    name: 'Credential theft',
    threat_steward_user_id: 17,
    threat_steward: {
        name: 'Clara Security',
        email: 'ciso@test.local',
        role_name: 'ciso',
        department_name: 'Security',
    },
    stewardship_status: 'assigned',
    category: 'confidentiality',
    notes: 'Existing note',
    is_archived: false,
    capabilities: {
        can_read: true,
        can_update: true,
        can_archive: true,
        can_restore: false,
    },
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
} as Threat;

function NavigatingThreatEdit() {
    const navigate = useNavigate();
    return (
        <>
            <button type="button" onClick={() => void navigate('/threats/88')}>
                Back to Threat
            </button>
            <ThreatForm
                initialData={nonProtectedThreat}
                isEdit
                onApprovalQueued={(queued) => {
                    void navigate(`/approvals?tab=mine&approvalId=${queued.approval_id}`);
                }}
                onSaved={(saved) => {
                    void navigate(`/threats/${saved.id}`);
                }}
                onCancel={() => void navigate('/threats/88')}
            />
        </>
    );
}

function renderNavigatingEdit() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const router = createMemoryRouter([
        { path: '/threats/88/edit', element: <NavigatingThreatEdit /> },
        { path: '/threats/88', element: <p>Threat detail</p> },
        { path: '/approvals', element: <p>Approvals</p> },
    ], {
        initialEntries: ['/threats/88', '/threats/88/edit'],
        initialIndex: 1,
    });
    const visitedLocations: string[] = [];
    let previousLocationKey = router.state.location.key;
    router.subscribe((state) => {
        if (state.location.key === previousLocationKey) return;
        previousLocationKey = state.location.key;
        visitedLocations.push(`${state.location.pathname}${state.location.search}`);
    });
    const utils = render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    return { router, visitedLocations, ...utils };
}

describe('ThreatForm — governed Threat Steward edit (#88)', () => {
    it('guards the edit wrapper Back action and clears after a whitespace-equivalent revert', async () => {
        const user = userEvent.setup();
        const { router } = renderNavigatingEdit();
        const notes = screen.getByTestId('threat-form-notes');

        await user.clear(notes);
        await user.type(notes, 'Changed note');
        await user.click(screen.getByRole('button', { name: 'Back to Threat' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/threats/88/edit');
        await user.click(screen.getByRole('button', { name: i18n.t('common:actions.stay') }));

        await user.clear(notes);
        await user.type(notes, '  Existing note  ');
        await user.click(screen.getByRole('button', { name: 'Back to Threat' }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/threats/88'));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('guards a create-mode Cancel callback through the local leave adapter', async () => {
        const user = userEvent.setup();
        const onCancel = vi.fn();
        renderForm(undefined, onCancel);

        await user.type(screen.getByTestId('threat-form-name'), 'New threat');
        await user.click(screen.getByTestId('threat-form-cancel'));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(onCancel).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: i18n.t('common:actions.leave') }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('requires and focuses a localized reason for an actual steward delta', async () => {
        const user = userEvent.setup();
        const { container } = renderForm(nonProtectedThreat);

        await user.click(screen.getByTestId('threat-form-steward'));
        await user.click(await screen.findByRole('option', { name: /Diego Security/ }));
        expect(screen.getByTestId('threat-form-submit')).toHaveTextContent(
            i18n.t('threats:actions.submit_for_approval'),
        );
        await user.click(screen.getByTestId('threat-form-submit'));

        const reason = screen.getByTestId('threat-form-request-reason');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        expect(reason).toHaveFocus();
        expect(screen.getByText(i18n.t('threats:form.errors.request_reason_required'))).toBeInTheDocument();
        expect(mockUpdateThreat).not.toHaveBeenCalled();
        await expectNoAxeViolations(container);
    });

    it('submits the reason and routes a typed approval-created 202 to the callback', async () => {
        const user = userEvent.setup();
        mockUpdateThreat.mockResolvedValue(approvalCreatedResponseSchema.parse({
            status: 'approval_required',
            message: 'Submitted',
            approval_id: 88,
            action_type: 'edit',
            pending_fields: ['threat_steward'],
            pending_changes: {
                threat_steward: { old: 'Clara Security', new: 'Diego Security' },
            },
            primary_approver_id: null,
            requires_privileged_approval: false,
            proposal_id: 'proposal-threat-steward-88',
            proposal_version: 1,
        }));
        const { onApprovalQueued, onSaved } = renderForm(nonProtectedThreat);

        await user.click(screen.getByTestId('threat-form-steward'));
        await user.click(await screen.findByRole('option', { name: /Diego Security/ }));
        await user.type(
            screen.getByTestId('threat-form-request-reason'),
            'Transfer stewardship to the incident response lead',
        );
        await user.click(screen.getByTestId('threat-form-submit'));

        await waitFor(() => expect(mockUpdateThreat).toHaveBeenCalledWith(
            88,
            expect.objectContaining({
                threat_steward_user_id: 18,
                request_reason: 'Transfer stewardship to the incident response lead',
            }),
        ));
        expect(onApprovalQueued).toHaveBeenCalledWith(expect.objectContaining({
            approval_id: 88,
            proposal_id: 'proposal-threat-steward-88',
            proposal_version: 1,
        }));
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('keeps a rejected governed edit dirty', async () => {
        const user = userEvent.setup();
        mockUpdateThreat.mockRejectedValue(new Error('approval service unavailable'));
        const { router } = renderNavigatingEdit();

        await user.click(screen.getByTestId('threat-form-steward'));
        await user.click(await screen.findByRole('option', { name: /Diego Security/ }));
        await user.type(
            screen.getByTestId('threat-form-request-reason'),
            'Transfer stewardship to the incident response lead',
        );
        await user.click(screen.getByTestId('threat-form-submit'));
        expect(await screen.findByText(i18n.t('threats:form.errors.save_failed'))).toBeInTheDocument();

        await user.click(screen.getByTestId('threat-form-cancel'));

        expect(await screen.findByRole('alertdialog')).toHaveTextContent(
            i18n.t('common:confirmation.unsaved_changes'),
        );
        expect(router.state.location.pathname).toBe('/threats/88/edit');
    });

    it('accepts an approval-queued edit before navigating exactly once', async () => {
        const user = userEvent.setup();
        const queuedResponse = approvalCreatedResponseSchema.parse({
            status: 'approval_required',
            message: 'Submitted',
            approval_id: 88,
            action_type: 'edit',
            pending_fields: ['threat_steward'],
            pending_changes: {
                threat_steward: { old: 'Clara Security', new: 'Diego Security' },
            },
            primary_approver_id: null,
            requires_privileged_approval: false,
            proposal_id: 'proposal-threat-steward-88',
            proposal_version: 1,
        });
        let resolveUpdate: (value: typeof queuedResponse) => void = () => {};
        mockUpdateThreat.mockReturnValue(new Promise((resolve) => {
            resolveUpdate = resolve;
        }));
        const { router, visitedLocations } = renderNavigatingEdit();

        await user.click(screen.getByTestId('threat-form-steward'));
        await user.click(await screen.findByRole('option', { name: /Diego Security/ }));
        await user.type(
            screen.getByTestId('threat-form-request-reason'),
            'Transfer stewardship to the incident response lead',
        );
        await user.click(screen.getByTestId('threat-form-submit'));
        await waitFor(() => expect(mockUpdateThreat).toHaveBeenCalledTimes(1));

        expect(screen.getByTestId('threat-form-request-reason')).toBeDisabled();
        expect(screen.getByTestId('threat-form-cancel')).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Back to Threat' }));
        expect(router.state.location.pathname).toBe('/threats/88/edit');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await act(async () => resolveUpdate(queuedResponse));

        await waitFor(() => expect(router.state.location.pathname).toBe('/approvals'));
        expect(router.state.location.search).toBe('?tab=mine&approvalId=88');
        expect(mockUpdateThreat).toHaveBeenCalledTimes(1);
        expect(visitedLocations).toEqual(['/approvals?tab=mine&approvalId=88']);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('keeps the same steward and an unrelated non-protected edit direct', async () => {
        const user = userEvent.setup();
        mockUpdateThreat.mockResolvedValue({
            ...nonProtectedThreat,
            notes: 'Updated without reassignment',
        });
        const { onApprovalQueued, onSaved } = renderForm(nonProtectedThreat);

        await waitFor(() => expect(screen.getByTestId('threat-form-steward')).toHaveTextContent('Clara Security'));
        expect(screen.getByTestId('threat-form-request-reason')).not.toHaveAttribute('aria-required', 'true');
        await user.clear(screen.getByTestId('threat-form-notes'));
        await user.type(screen.getByTestId('threat-form-notes'), 'Updated without reassignment');
        expect(screen.getByTestId('threat-form-submit')).toHaveTextContent(i18n.t('threats:actions.save'));
        await user.click(screen.getByTestId('threat-form-submit'));

        await waitFor(() => expect(mockUpdateThreat).toHaveBeenCalledTimes(1));
        const submittedPayload = mockUpdateThreat.mock.calls[0]?.[1];
        expect(submittedPayload).toEqual(expect.objectContaining({
            threat_steward_user_id: 17,
            notes: 'Updated without reassignment',
        }));
        expect(submittedPayload).not.toHaveProperty('request_reason');
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
            notes: 'Updated without reassignment',
        }));
        expect(onApprovalQueued).not.toHaveBeenCalled();
    });

    it('saves a steward reassignment without reason when the live scenario is disabled', async () => {
        accountabilityScenario.enabled = false;
        const user = userEvent.setup();
        mockUpdateThreat.mockResolvedValue({ ...nonProtectedThreat, threat_steward_user_id: 18 });
        const { onSaved } = renderForm(nonProtectedThreat);

        await user.click(screen.getByTestId('threat-form-steward'));
        await user.click(await screen.findByRole('option', { name: /Diego Security/ }));
        expect(screen.getByTestId('threat-form-submit')).toHaveTextContent(i18n.t('threats:actions.save'));
        await user.click(screen.getByTestId('threat-form-submit'));

        await waitFor(() => expect(mockUpdateThreat).toHaveBeenCalledTimes(1));
        expect(mockUpdateThreat.mock.calls[0]?.[1]).not.toHaveProperty('request_reason');
        expect(onSaved).toHaveBeenCalled();
    });
});

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('ThreatForm — Field migration + validation + submit feedback (#59)', () => {
    it('loads active CISOs through the purpose-scoped Threat Steward lookup', async () => {
        renderForm();

        await waitFor(() => {
            expect(mockGetThreatStewards).toHaveBeenCalledWith({ q: undefined, limit: 50 });
        });
    });

    it('associates the required name control with its label and exposes aria-required', () => {
        renderForm();
        const name = screen.getByRole('textbox', { name: nameLabel() });
        expect(name).toHaveAttribute('aria-required', 'true');
    });

    it('on invalid submit: focuses the name field, sets aria-invalid, shows role=alert + per-field error', async () => {
        const user = userEvent.setup();
        renderForm();

        await user.click(screen.getByTestId('threat-form-submit'));

        const name = screen.getByRole('textbox', { name: nameLabel() });
        expect(name).toHaveAttribute('aria-invalid', 'true');
        expect(name).toHaveFocus();
        expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('threats:form.errors.fix_fields'));
        expect(screen.getByText(i18n.t('threats:form.errors.name_required'))).toBeInTheDocument();
        expect(mockCreateThreat).not.toHaveBeenCalled();
    });

    it('labels and focuses the required CISO steward selector when it is the first invalid field', async () => {
        const user = userEvent.setup();
        renderForm();

        await user.type(screen.getByRole('textbox', { name: nameLabel() }), 'Phishing');
        await user.click(screen.getByTestId('threat-form-submit'));

        const steward = screen.getByRole('combobox', { name: i18n.t('threats:form.steward') });
        expect(steward).toHaveAttribute('aria-required', 'true');
        expect(steward).toHaveAttribute('aria-invalid', 'true');
        expect(steward).toHaveFocus();
        expect(screen.getByText(i18n.t('threats:form.errors.steward_required'))).toBeInTheDocument();
        expect(mockCreateThreat).not.toHaveBeenCalled();
    });

    it('submits successfully and reports back through onSaved', async () => {
        const user = userEvent.setup();
        mockCreateThreat.mockResolvedValue({ id: 9, name: 'Phishing' });
        const { onSaved } = renderForm();

        await user.type(screen.getByRole('textbox', { name: nameLabel() }), 'Phishing');
        await user.click(screen.getByTestId('threat-form-steward'));
        await user.click(await screen.findByRole('option', { name: /Clara Security/ }));
        await user.click(screen.getByTestId('threat-form-submit'));

        await waitFor(() => expect(mockCreateThreat).toHaveBeenCalledTimes(1));
        expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('gives submit feedback and surfaces the save-failed banner on rejection', async () => {
        const user = userEvent.setup();
        let rejectSave: (reason?: unknown) => void = () => {};
        mockCreateThreat.mockReturnValue(
            new Promise((_resolve, reject) => {
                rejectSave = reject;
            }),
        );
        renderForm();

        await user.type(screen.getByRole('textbox', { name: nameLabel() }), 'Phishing');
        await user.click(screen.getByTestId('threat-form-steward'));
        await user.click(await screen.findByRole('option', { name: /Clara Security/ }));
        const submit = screen.getByTestId('threat-form-submit');
        await user.click(submit);

        // Submit feedback (S11): the button disables while the request is pending.
        await waitFor(() => expect(submit).toBeDisabled());

        rejectSave(new Error('boom'));
        expect(await screen.findByText(i18n.t('threats:form.errors.save_failed'))).toBeInTheDocument();
    });

    it('reads .isError on the CISO lookup with a retry affordance', async () => {
        mockGetThreatStewards.mockRejectedValue(new Error('down'));
        renderForm();

        expect(await screen.findByText(i18n.t('threats:form.errors.lists_failed'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: i18n.t('threats:actions.retry') })).toBeInTheDocument();
    });

    it('has no axe violations in the validation-error state (N10)', async () => {
        const user = userEvent.setup();
        const { container } = renderForm();

        await user.click(screen.getByTestId('threat-form-submit'));
        expect(screen.getByRole('alert')).toBeInTheDocument();

        await expectNoAxeViolations(container);
    });
});
