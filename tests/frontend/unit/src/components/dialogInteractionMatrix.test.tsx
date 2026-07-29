import * as axe from 'axe-core';
import { http, HttpResponse } from 'msw';
import { useState, type ReactElement, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, render, renderWithoutProviders, screen, userEvent, waitFor, within } from '@test/render';
import { server } from '@test/mocks/server';
import { useTranslation } from '@/i18n/hooks';
import { ControlRiskLoadingOverlay } from '@/components/controls/ControlRiskLoadingOverlay';

// --- Real dialog / alertdialog surfaces under test -------------------------
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ArchiveConfirmDialog } from '@/components/ArchiveConfirmDialog';
import { KriMismatchDialog } from '@/components/kri-form/KriMismatchDialog';
import { RoleDeleteDialog } from '@/components/riskhub/roles/RoleDeleteDialog';
import { RoleModal } from '@/components/riskhub/roles/RoleModal';
import { AuditDetailsModal } from '@/pages/admin-console/sections/audit/AuditDetailsModal';
import { BreakGlassEnableDialog } from '@/pages/users/BreakGlassEnableDialog';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { ApprovalResolutionDialog } from '@/pages/approvals/ApprovalResolutionDialog';
import { ExportDialog } from '@/components/reports/ExportDialog';
import { RiskQuickViewModal } from '@/components/RiskQuickViewModal';
import { ExecutionLogModal } from '@/components/executions/ExecutionLogModal';
import { KRIValueModal } from '@/components/kri/KRIValueModal';
import { KRIHistoryEditModal } from '@/components/kri/KRIHistoryEditModal';
import { RiskDrilldownModal } from '@/components/dashboard/RiskDrilldownModal';
import { OrphanQuickViewModal } from '@/components/governance/OrphanQuickViewModal';
import { ResolveOrphanModal } from '@/components/governance/ResolveOrphanModal';
import { KRIModal } from '@/components/kri/KRIModal';
import { AccessEditModal } from '@/components/access/AccessEditModal';
import { RiskQuestionnaireDetail } from '@/components/risks/risk-questionnaire-detail/RiskQuestionnaireDetailContainer';
// R4 — five surfaces previously only "verified via existing test" (two of which
// were actually stubbed `() => null` in those tests). Mounted OPEN here through
// the real render helper so the full contract is proven, not asserted by proxy.
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import { ADUserPicker } from '@/components/users/ADUserPicker';
import { ControlCreateDialog } from '@/components/ControlCreateDialog';
import { DepartmentsPanel } from '@/components/riskhub/DepartmentsPanel';
import { RiskTypesPanel } from '@/components/riskhub/RiskTypesPanel';
import { ApprovalScenariosPanel } from '@/components/riskhub/ApprovalScenariosPanel';

import type { RoleHubRead } from '@/services/riskHubApi';
import type { KeyRiskIndicator, KRIHistoryEntry } from '@/types/kri';
import type { AccessUserRead } from '@/types/access';
import type { ApprovalRequest } from '@/types/approval';
import type { Risk } from '@/types/risk';
import type { OrphanedItem } from '@/types/orphanedItem';

/**
 * FR-P2c-1 — Per-surface interaction contract matrix.
 *
 * `DialogShell.test.tsx` proves the shared primitive with a synthetic harness.
 * This file is the *per-surface* proof: it mounts EACH real dialog /
 * alertdialog component OPEN through the project render helper (AllProviders +
 * MSW) and asserts the same seven-point contract the primitive guarantees, plus
 * an open-state axe sweep with the pinned WCAG tags used elsewhere.
 *
 * Every surface below is ACTIVE. The surfaces that formerly failed the OPEN
 * contract (invariably an icon-only control with no accessible name → axe
 * `button-name` / `label`) were the C5a accessible-name worklist; C5a added the
 * localized `aria-label` / label association to each offending component and
 * un-skipped them here. Each case retains a `C5a — accessible-name fixed`
 * annotation citing the control that was remediated.
 *
 * The companion inventory:
 *   docs/dora-ict-register/FRONTEND-DIALOG-INTERACTION-INVENTORY.md
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

let canvasContextSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
    canvasContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContext() {
        const canvas = this;
        return {
            canvas,
            clearRect: () => {},
            fillText: () => {},
            getImageData: (_x: number, _y: number, width: number, height: number) => {
                const data = new Uint8ClampedArray(Math.max(4, Math.ceil(width * height * 4)));
                data[0] = 255;
                return { data };
            },
            measureText: (text: string) => ({ width: Math.max(1, text.length * 10) }),
            textAlign: 'left',
            textBaseline: 'top',
        } as unknown as CanvasRenderingContext2D;
    });
});

afterAll(() => canvasContextSpy.mockRestore());

beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
    await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    const unexpectedOutput = [
        ...consoleErrorSpy.mock.calls.map((args) => `console.error: ${args.map(String).join(' ')}`),
        ...consoleWarnSpy.mock.calls.map((args) => `console.warn: ${args.map(String).join(' ')}`),
    ];
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    expect(unexpectedOutput, unexpectedOutput.join('\n')).toEqual([]);
});

async function expectNoAxeViolations(node: Element | Document = document.body): Promise<void> {
    const results = await axe.run(node as Element, {
        runOnly: { type: 'tag', values: AXE_TAGS },
    });
    const summary = results.violations
        .map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
        .join('\n');
    expect(summary, summary).toBe('');
}

type Role = 'dialog' | 'alertdialog';
type RenderSurface = (onClose: () => void) => ReactNode;

function SurfaceHarness({ renderSurface }: { renderSurface: RenderSurface }) {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <button type="button" onClick={() => setOpen(true)}>
                launch
            </button>
            {open ? renderSurface(() => setOpen(false)) : null}
        </div>
    );
}

type TestUser = ReturnType<typeof userEvent.setup>;
/** Optional gate: wait until a network-backed surface reaches its usable state. */
type WaitForReady = (surface: HTMLElement) => Promise<void>;

/**
 * The shared seven-point contract, run against an already-open surface and its
 * opener: modal semantics, an accessible name, initial focus inside, Tab +
 * Shift-Tab stay trapped, an open-state axe sweep with the pinned tags, then
 * Escape closes and focus restores to the opener.
 */
async function assertOpenDialogContract(
    user: TestUser,
    role: Role,
    surface: HTMLElement,
    opener: HTMLElement,
): Promise<void> {
    // Correct role (implied by findByRole) + modal semantics.
    expect(surface).toHaveAttribute('aria-modal', 'true');

    // An accessible name, sourced from aria-labelledby → title element text.
    const labelledBy = surface.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const accessibleName = (labelledBy ?? '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim();
    expect(accessibleName.length, 'dialog must expose a non-empty accessible name').toBeGreaterThan(0);

    // Initial focus lands inside the surface (element self-contains).
    await waitFor(() => expect(surface.contains(document.activeElement)).toBe(true));

    // Prove both trap boundaries, independent of how many controls the dialog has.
    const focusable = Array.from(surface.querySelectorAll<HTMLElement>([
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
    ].join(','))).filter((element) => (
        element.getAttribute('aria-hidden') !== 'true'
        && !element.closest('[aria-hidden="true"]')
    ));
    expect(focusable.length, 'dialog must expose at least one tabbable control').toBeGreaterThan(0);
    const firstFocusable = focusable[0]!;
    const lastFocusable = focusable.at(-1)!;

    lastFocusable.focus();
    await user.tab();
    expect(firstFocusable).toHaveFocus();

    firstFocusable.focus();
    await user.tab({ shift: true });
    expect(lastFocusable).toHaveFocus();

    // Open-state axe sweep with the shared pinned tags.
    await expectNoAxeViolations(document.body);

    // Escape closes and restores focus to the opener.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole(role)).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
}

/**
 * Drives the full seven-point DialogShell contract against a real surface that
 * is opened directly via an `isOpen`/`onClose` prop pair. `waitForReady` (used
 * by the network-backed R4 surfaces) blocks until the dialog reaches its usable
 * state — its MSW-backed lookups resolved — so the focus/axe assertions prove a
 * loaded dialog, not just an opened shell.
 */
async function assertDialogContract(
    role: Role,
    renderSurface: RenderSurface,
    waitForReady?: WaitForReady,
): Promise<void> {
    const user = userEvent.setup();
    render(<SurfaceHarness renderSurface={renderSurface} />);

    const launch = screen.getByRole('button', { name: 'launch' });
    launch.focus();
    await user.click(launch);

    const surface = await screen.findByRole(role);
    if (waitForReady) {
        await waitForReady(surface);
    }

    await assertOpenDialogContract(user, role, surface, launch);
}

/**
 * Variant for surfaces whose open state is only reachable through a parent
 * component's data load + row action (the `DepartmentsPanel` / `RiskTypesPanel`
 * delete confirmations, whose markup is private to the panel). `triggerDialog`
 * renders through the panel, waits for the loaded row action, focuses + clicks
 * it, and returns that control as the opener whose focus must be restored.
 */
async function assertTriggeredDialogContract(
    role: Role,
    host: ReactElement,
    triggerDialog: (user: TestUser) => Promise<HTMLElement>,
): Promise<void> {
    const user = userEvent.setup();
    render(host);

    const opener = await triggerDialog(user);
    const surface = await screen.findByRole(role);

    await assertOpenDialogContract(user, role, surface, opener);
}

// --- Fixtures --------------------------------------------------------------

const roleFixture: RoleHubRead = {
    id: 1,
    name: 'auditor',
    display_name: 'Auditor',
    description: 'Read-only auditor role',
    is_system: false,
    is_active: true,
    user_count: 0,
    permissions: [],
};

const kriFixture = {
    id: 1,
    risk_id: 1,
    metric_name: 'System uptime',
    description: 'Uptime KRI',
    current_value: 99,
    lower_limit: 90,
    upper_limit: 100,
    unit: '%',
    last_period_end: null,
    capabilities: null,
} as unknown as KeyRiskIndicator;

const kriHistoryEntry = {
    id: 1,
    kri_id: 1,
    period_start: '2026-01-01',
    period_end: '2026-01-31',
    recorded_at: '2026-02-01T00:00:00Z',
    value: 95,
    lower_limit: 90,
    upper_limit: 100,
    unit: '%',
    breach_status: 'within',
} as KRIHistoryEntry;

const accessUserFixture = {
    id: 1,
    email: 'ada@example.test',
    name: 'Ada Lovelace',
    is_active: true,
    role_id: 1,
    role: { id: 1, name: 'auditor', display_name: 'Auditor', description: null },
    department_id: null,
    department_name: null,
    manager_id: null,
    manager_name: null,
    access_scope: 'department',
    scope_label: 'Department',
    effective_permissions: [],
    capabilities: {
        can_edit_identity: false,
        can_edit_business_access: false,
        can_edit_role: false,
        can_deactivate: false,
        can_change_active_status: false,
        can_break_glass_enable: false,
        can_revoke_sessions: false,
    },
} as unknown as AccessUserRead;

const approvalFixture = {
    id: 1,
    resource_type: 'risk',
    resource_id: 1,
    resource_name: 'Authentication Drift',
    action_type: 'update',
    pending_changes: null,
    status: 'pending',
    reason: 'needs review',
    requested_by_id: 2,
    requested_by_name: 'Jo Requester',
    requested_by_email: 'jo@example.test',
    resolved_by_id: null,
    resolved_by_name: null,
    resolved_at: null,
    resolution_notes: null,
    created_at: '2026-02-01T00:00:00Z',
    can_approve: true,
    can_reject: true,
} as unknown as ApprovalRequest;

const riskFixture = {
    id: 1,
    name: 'Authentication Drift',
    category: 'IT',
    process: 'User Authentication',
    description: 'Risk of access control drift.',
    gross_score: 12,
    gross_probability: 3,
    gross_impact: 4,
    net_score: 6,
    net_probability: 2,
    net_impact: 3,
    risk_type: 'operational',
    updated_at: '2026-02-01T00:00:00Z',
    owner: { id: 9, name: 'Ada Owner', email: 'ada@example.test' },
    department: { id: 1, name: 'IT' },
} as unknown as Risk;

const orphanFixture: OrphanedItem = {
    id: 1,
    item_type: 'risk',
    item_id: 1,
    item_name: 'Authentication Drift',
    item_description: null,
    item_identifier: null,
    department_name: 'IT',
    previous_owner_name: 'Jo Owner',
    previous_owner_email: 'jo@example.test',
    orphaned_at: '2026-02-01T00:00:00Z',
    status: 'pending',
    capabilities: {
        can_resolve: true,
        can_view_detail: true,
        requires_department: false,
        requires_owner: true,
        requires_risk: false,
    },
};

const questionnaireFixture = {
    id: 1,
    risk_id: 1,
    risk_name: 'Authentication Drift',
    assigned_to_user_id: 9,
    sent_by_user_id: 2,
    status: 'in_progress',
    template_key: 'risk_owner_reassessment',
    template_version: 'v1',
    sent_at: '2026-01-01T00:00:00Z',
    due_at: '2026-12-31T00:00:00Z',
    answers: {},
    capabilities: {
        can_open: false,
        can_save_draft: false,
        can_submit: false,
        can_request_clarification: false,
        can_respond_to_clarifications: false,
    },
};

// Wrapper for ApprovalResolutionDialog, which receives its `t` from the caller.
function ApprovalResolutionSurface({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation(['approvals', 'common']);
    return (
        <ApprovalResolutionDialog
            selectedApproval={approvalFixture}
            dialogMode="approve"
            resolutionNotes=""
            isSubmitting={false}
            onClose={onClose}
            onResolve={() => {}}
            onResolutionNotesChange={() => {}}
            t={t}
        />
    );
}

// ---------------------------------------------------------------------------
// GREEN — real surfaces that satisfy the full contract today.
// ---------------------------------------------------------------------------

describe('Dialog interaction matrix — alertdialog surfaces (FR-P2c-1)', () => {
    it('[owner.confirm-dialog] ConfirmDialog', async () => {
        await assertDialogContract('alertdialog', (onClose) => (
            <ConfirmDialog
                isOpen
                onClose={onClose}
                onConfirm={() => {}}
                title="Delete department?"
                message="This cannot be undone."
            />
        ));
    });

    it('[owner.archive-confirm-dialog] ArchiveConfirmDialog', async () => {
        await assertDialogContract('alertdialog', (onClose) => (
            <ArchiveConfirmDialog
                isOpen
                onClose={onClose}
                onConfirm={async () => {}}
                resourceType="control"
                resourceName="Access Control Review"
            />
        ));
    });

    it('[owner.kri-mismatch-dialog] KriMismatchDialog', async () => {
        await assertDialogContract('alertdialog', (onClose) => (
            <KriMismatchDialog
                isSubmitting={false}
                onCancel={onClose}
                onContinueWithoutLinking={() => {}}
                onLinkRiskAndContinue={() => {}}
            />
        ));
    });

    it('[owner.role-delete-dialog] RoleDeleteDialog', async () => {
        await assertDialogContract('alertdialog', (onClose) => (
            <RoleDeleteDialog onCancel={onClose} onConfirm={() => {}} role={roleFixture} />
        ));
    });
});

describe('Dialog interaction matrix — dialog surfaces (FR-P2c-1)', () => {
    it('[owner.role-modal] RoleModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <RoleModal
                allPermissions={[]}
                isOpen
                onClose={onClose}
                onSave={async () => {}}
                permissionsLoading={false}
                role={null}
            />
        ));
    });

    it('[owner.audit-details-modal] AuditDetailsModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <AuditDetailsModal extra={{ action: 'update', field: 'name' }} onClose={onClose} />
        ));
    });

    it('[owner.break-glass-enable-dialog] BreakGlassEnableDialog', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <BreakGlassEnableDialog
                breakGlassHours={4}
                breakGlassReason=""
                breakGlassUser={accessUserFixture}
                isBreakGlassSubmitting={false}
                onClose={onClose}
                onReasonChange={() => {}}
                onSubmit={() => {}}
                onHoursChange={() => {}}
            />
        ));
    });
});

// ---------------------------------------------------------------------------
// Formerly-RED surfaces — each failed the OPEN-state contract on a missing
// accessible name (icon-only close button / unlabeled input). C5a added the
// localized `aria-label` / label association to each and un-skipped them; the
// per-case note cites the control that was remediated.
// ---------------------------------------------------------------------------

describe('Dialog interaction matrix — accessible-name fixed (C5a)', () => {
    // C5a — accessible-name fixed (was RED):form inputs use ISSUE_LABEL (unassociated <label>, IssueQuickCreateModal.tsx:132) so axe label fails.
    it('[owner.issue-quick-create-modal] IssueQuickCreateModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <IssueQuickCreateModal
                isOpen
                onClose={onClose}
                contextEntityType="risk"
                contextEntityId={1}
                contextEntityLabel="Authentication Drift"
                onCreated={() => {}}
            />
        ));
    });

    // C5a — accessible-name fixed (was RED):resolution textarea has no programmatic label (ApprovalResolutionDialog.tsx:49), axe label fails.
    it('[owner.approval-resolution-dialog] ApprovalResolutionDialog', async () => {
        await assertDialogContract('dialog', (onClose) => <ApprovalResolutionSurface onClose={onClose} />);
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (ExportDialog.tsx:76) + unlabeled date input (ExportDialog.tsx:91); axe button-name + label fail.
    it('[owner.export-dialog] ExportDialog', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <ExportDialog isOpen onClose={onClose} onSubmit={async () => {}} />
        ));
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (RiskQuickViewModal.tsx:55), axe button-name fails.
    it('[owner.risk-quick-view-modal] RiskQuickViewModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <RiskQuickViewModal isOpen onClose={onClose} risk={riskFixture} />
        ));
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (ExecutionLogModal.tsx:74) + unlabeled form fields; axe button-name + label fail.
    it('[owner.execution-log-modal] ExecutionLogModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <ExecutionLogModal
                isOpen
                onClose={onClose}
                controlId={1}
                controlName="Access Control Review"
            />
        ));
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (KRIValueModal.tsx:96) + unlabeled value/backdate inputs; axe button-name + label fail.
    it('[owner.kri-value-modal] KRIValueModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <KRIValueModal kri={kriFixture} isOpen onClose={onClose} onSuccess={() => {}} />
        ));
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (KRIHistoryEditModal.tsx:84) + unlabeled value/reason inputs; axe button-name + label fail.
    it('[owner.kri-history-edit-modal] KRIHistoryEditModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <KRIHistoryEditModal
                isOpen
                onClose={onClose}
                kriId={1}
                entry={kriHistoryEntry}
                onSuccess={() => {}}
            />
        ));
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (RiskDrilldownModal.tsx:107), axe button-name fails.
    it('[owner.risk-drilldown-modal] RiskDrilldownModal', async () => {
        server.use(
            http.get('*/api/v1/dashboard/risks-by-cell', () => HttpResponse.json([{
                id: 41,
                risk_id_code: 'R-0041',
                name: 'Matrix Risk',
                description: 'Loaded through the real dashboard endpoint.',
                net_score: 16,
                department_name: 'Operations',
                owner_name: 'Matrix Owner',
            }])),
        );
        await assertDialogContract(
            'dialog',
            (onClose) => <RiskDrilldownModal isOpen onClose={onClose} probability={4} impact={4} />,
            async (surface) => {
                await within(surface).findByText('Matrix Risk');
            },
        );
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (OrphanQuickViewModal.tsx:128), axe button-name fails.
    it('[owner.orphan-quick-view-modal] OrphanQuickViewModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <OrphanQuickViewModal isOpen onClose={onClose} orphan={orphanFixture} />
        ));
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (ResolveOrphanModal.tsx:58), axe button-name fails.
    it('[owner.resolve-orphan-modal] ResolveOrphanModal', async () => {
        server.use(
            http.get('*/api/v1/users', () => HttpResponse.json([{
                id: 7,
                email: 'matrix.assignee@example.test',
                name: 'Matrix Assignee',
                is_active: true,
                role: { id: 3, name: 'employee', display_name: 'Employee', description: null },
                department_id: 1,
                manager_id: null,
                manager_name: null,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
            }])),
            http.get('*/api/v1/departments', () => HttpResponse.json([departmentLookupFixture])),
        );
        await assertDialogContract(
            'dialog',
            (onClose) => <ResolveOrphanModal isOpen onClose={onClose} orphan={orphanFixture} onResolved={() => {}} />,
            async (surface) => {
                await within(surface).findByText('Matrix Assignee');
            },
        );
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (KriModalHeader.tsx:31), axe button-name fails.
    it('[owner.kri-modal] KRIModal', async () => {
        server.use(
            http.get('*/api/v1/vendors', () => HttpResponse.json({ items: [], total: 0, offset: 0, limit: 25 })),
        );
        await assertDialogContract(
            'dialog',
            (onClose) => (
                <KRIModal
                    risk_id={1}
                    kri={null}
                    isOpen
                    onClose={onClose}
                    onSave={async () => ({ kind: 'updated' })}
                />
            ),
            async (surface) => {
                await within(surface).findByText('No vendors found.');
            },
        );
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (AccessEditModalSections.tsx:26), axe button-name fails.
    it('[owner.access-edit-modal] AccessEditModal', async () => {
        server.use(
            http.get('*/api/v1/access/roles', () => HttpResponse.json([])),
        );
        await assertDialogContract(
            'dialog',
            (onClose) => <AccessEditModal isOpen onClose={onClose} user={accessUserFixture} onSaved={() => {}} />,
            async (surface) => {
                await within(surface).findByTestId('access-edit-ready');
            },
        );
    });

    // C5a — accessible-name fixed (was RED):header close button lacks aria-label (RiskQuestionnaireDetailHeader) so axe button-name fails.
    it('[owner.risk-questionnaire-detail] RiskQuestionnaireDetail', async () => {
        server.use(
            http.get('*/api/v1/questionnaires/1', () => HttpResponse.json(questionnaireFixture)),
            http.get('*/api/v1/questionnaires/1/clarifications', () => HttpResponse.json([])),
        );
        await assertDialogContract(
            'dialog',
            (onClose) => (
                <RiskQuestionnaireDetail
                    isOpen
                    onClose={onClose}
                    questionnaireId={1}
                    risk={riskFixture}
                />
            ),
            async (surface) => {
                await within(surface).findByTestId('risk-questionnaire-ready');
            },
        );
    });
});

// ---------------------------------------------------------------------------
// R4 — network-backed & row-triggered surfaces. Each reaches its open + usable
// state only after MSW-backed data loads (and, for the panels, a row action).
// Each was previously only "verified via existing test"; two of them
// (ADUserPicker, ControlCreateDialog) were in fact stubbed `() => null` in those
// tests. Mounted REAL and OPEN here, gated on a loaded-state sentinel, under the
// same seven-point contract as every other surface.
// ---------------------------------------------------------------------------

// Deterministic, zod-valid lookup payloads. Each test registers only the
// handlers its surface hits via `server.use` (reset by vitest.setup.ts after
// every test); the shared server hard-fails any unhandled request, so the matrix
// proves each surface's exact network contract with zero stray requests.

const departmentLookupFixture = {
    id: 1,
    name: 'IT',
    code: 'IT',
    user_count: 0,
    risk_count: 0,
    high_risk_count: 0,
    control_count: 0,
    kri_count: 0,
    breaching_kri_count: 0,
    total_net_score: 0,
};

const riskFiltersFixture = {
    processes: ['User Authentication'],
    categories: ['IT'],
};

const departmentHubFixture = {
    id: 1,
    name: 'IT',
    code: 'IT',
    manager_id: null,
    manager_name: null,
    is_active: true,
    user_count: 0,
    risk_count: 0,
    control_count: 0,
    kri_count: 0,
    vendor_count: 0,
    pending_orphan_count: 0,
    capabilities: { can_update: true, can_delete: true, can_restore: false },
};

const riskTypeHubFixture = {
    id: 1,
    code: 'operational',
    display_name: 'Operational',
    description: 'Operational risks',
    color: '#3b82f6',
    icon: null,
    sort_order: 1,
    is_active: true,
    is_system: false,
    risk_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    capabilities: { can_create: true, can_update: true, can_delete: true, can_restore: false },
};

const riskHubPanelCapabilityFixture = { can_create: true, can_update: true, can_batch_send: false };
const riskHubCapabilitiesFixture = {
    risk_types: riskHubPanelCapabilityFixture,
    departments: riskHubPanelCapabilityFixture,
    roles: riskHubPanelCapabilityFixture,
    approval_scenarios: riskHubPanelCapabilityFixture,
    system_settings: riskHubPanelCapabilityFixture,
    questionnaires: riskHubPanelCapabilityFixture,
};

const approvalScenarioFixture = {
    id: 5,
    key: 'risk_update',
    display_name: 'Risk update',
    description: 'Approve risk updates',
    requires_approval: true,
    approver_roles: ['risk_owner'],
    fixed_policy: false,
    fixed_policy_definition: null,
    updated_at: '2026-04-01T00:00:00Z',
    updated_by_name: null,
    capabilities: { can_update: true },
};

describe('Dialog interaction matrix — network-backed surfaces (FR-P2c-1, R4)', () => {
    // R4 — real mount (was stubbed via existing test):search + filter lookups are network-backed; gated on a loaded search result.
    it('[owner.link-management-dialog] LinkManagementDialog', async () => {
        server.use(
            http.get('*/api/v1/departments', () => HttpResponse.json([departmentLookupFixture])),
            http.get('*/api/v1/lookups/risk-filters', () => HttpResponse.json(riskFiltersFixture)),
            // `/controls` (the risk-to-control search target) is served by the base handlers.
        );
        await assertDialogContract(
            'dialog',
            (onClose) => (
                <LinkManagementDialog
                    isOpen
                    onClose={onClose}
                    mode="risk-to-control"
                    existingLinks={[]}
                    onLink={async () => {}}
                    onUnlink={async () => {}}
                />
            ),
            // Loaded sentinel: department/filter lookups + the debounced control
            // search have resolved, so a real result row is rendered.
            async (surface) => {
                await within(surface).findByText('Access Control Review', {}, { timeout: 3000 });
            },
        );
    });

    // R4 — real mount (was stubbed `() => null` in UsersPage.sso-cta.test.tsx):no lookup on open; usable state = directory-search textbox.
    it('[owner.ad-user-picker] ADUserPicker', async () => {
        // ADUserPicker fires no lookup on open — its directory search is
        // user-triggered (debounced on keystrokes) — so no handler is required and
        // the usable state is the rendered directory-search textbox.
        await assertDialogContract(
            'dialog',
            (onClose) => <ADUserPicker isOpen onClose={onClose} onImported={() => {}} />,
            async (surface) => {
                await waitFor(() => expect(within(surface).getByRole('textbox')).toBeInTheDocument());
            },
        );
    });

    // R4 — real mount (was stubbed `() => null` in riskDetailOverviewKriNavigation.test.tsx):ControlForm lookups network-backed; gated on ready sentinel.
    it('[owner.control-create-dialog] ControlCreateDialog', async () => {
        server.use(
            http.get('*/api/v1/departments', () => HttpResponse.json([departmentLookupFixture])),
            // `/users/lookup` and `/risks` (ControlForm's other lookups) are base handlers.
        );
        await assertDialogContract(
            'dialog',
            (onClose) => <ControlCreateDialog isOpen onClose={onClose} onSuccess={() => {}} />,
            // Loaded sentinel: ControlForm's background lookups (users, departments,
            // risks) have all settled (`control-form-lookups-ready`).
            async (surface) => {
                await within(surface).findByTestId('control-form-lookups-ready', {}, { timeout: 3000 });
            },
        );
    });
});

describe('Dialog interaction matrix — RiskHubModalFrame consumers (FR-P2c-1)', () => {
    it('[owner.frame.departments] DepartmentsPanel edit dialog', async () => {
        server.use(
            http.get('*/api/v1/riskhub/capabilities', () => HttpResponse.json(riskHubCapabilitiesFixture)),
            http.get('*/api/v1/riskhub/departments', () => HttpResponse.json([departmentHubFixture])),
            http.get('*/api/v1/access/users', () => HttpResponse.json([])),
        );
        await assertTriggeredDialogContract('dialog', <DepartmentsPanel />, async (user) => {
            const edit = await screen.findByRole('button', { name: 'Edit' });
            edit.focus();
            await user.click(edit);
            return edit;
        });
    });

    it('[owner.frame.risk-types] RiskTypesPanel edit dialog', async () => {
        server.use(
            http.get('*/api/v1/riskhub/capabilities', () => HttpResponse.json(riskHubCapabilitiesFixture)),
            http.get('*/api/v1/riskhub/risk-types', () => HttpResponse.json([riskTypeHubFixture])),
        );
        await assertTriggeredDialogContract('dialog', <RiskTypesPanel />, async (user) => {
            const edit = await screen.findByRole('button', { name: 'Edit' });
            edit.focus();
            await user.click(edit);
            return edit;
        });
    });

    it('[owner.frame.approval-scenarios] ApprovalScenariosPanel configure dialog', async () => {
        server.use(
            http.get('*/api/v1/riskhub/capabilities', () => HttpResponse.json(riskHubCapabilitiesFixture)),
            http.get('*/api/v1/riskhub/approval-scenarios', () => HttpResponse.json([approvalScenarioFixture])),
            http.get('*/api/v1/riskhub/roles', () => HttpResponse.json([roleFixture])),
        );
        await assertTriggeredDialogContract('dialog', <ApprovalScenariosPanel />, async (user) => {
            const configure = await screen.findByRole('button', { name: 'Configure' });
            configure.focus();
            await user.click(configure);
            return configure;
        });
    });
});

describe('Dialog interaction matrix — row-triggered delete confirms (FR-P2c-1, R4)', () => {
    // R4 — real mount (was "verified via existing test"):delete confirm is private to the panel; reached via list load + row delete action.
    it('[owner.departments-delete] DepartmentsPanel delete confirm', async () => {
        server.use(
            http.get('*/api/v1/riskhub/capabilities', () => HttpResponse.json(riskHubCapabilitiesFixture)),
            http.get('*/api/v1/riskhub/departments', () => HttpResponse.json([departmentHubFixture])),
        );
        await assertTriggeredDialogContract('alertdialog', <DepartmentsPanel />, async (user) => {
            // Loaded sentinel: the row delete action only exists once the list +
            // capabilities loaded and the row exposes `can_delete`.
            const del = await screen.findByRole('button', { name: 'Delete' });
            del.focus();
            await user.click(del);
            return del;
        });
    });

    // R4 — real mount (was "verified via existing test"):delete confirm is private to the panel; reached via list load + row delete action.
    it('[owner.risk-types-delete] RiskTypesPanel delete confirm', async () => {
        server.use(
            http.get('*/api/v1/riskhub/capabilities', () => HttpResponse.json(riskHubCapabilitiesFixture)),
            http.get('*/api/v1/riskhub/risk-types', () => HttpResponse.json([riskTypeHubFixture])),
        );
        await assertTriggeredDialogContract('alertdialog', <RiskTypesPanel />, async (user) => {
            const del = await screen.findByRole('button', { name: 'Delete' });
            del.focus();
            await user.click(del);
            return del;
        });
    });
});

// ---------------------------------------------------------------------------
// Non-dialog busy overlay — must NOT be a dialog and must NOT transfer focus.
// ---------------------------------------------------------------------------

describe('ControlDetailPage loading overlay — role="status", not a dialog (FR-P2c-1)', () => {
    function LoadingOverlayHost() {
        return (
            <div>
                <button type="button">trigger</button>
                <ControlRiskLoadingOverlay isVisible />
            </div>
        );
    }

    it('[overlay.control-risk-loading] exposes role="status"/aria-busy, no dialog role, and keeps focus on the trigger', async () => {
        renderWithoutProviders(<LoadingOverlayHost />);

        const trigger = screen.getByRole('button', { name: 'trigger' });
        trigger.focus();
        expect(trigger).toHaveFocus();

        const status = screen.getByRole('status');
        expect(status).toHaveAttribute('aria-busy', 'true');

        // A busy overlay is not a modal dialog and must not steal focus.
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();

        await expectNoAxeViolations(document.body);
    });
});
