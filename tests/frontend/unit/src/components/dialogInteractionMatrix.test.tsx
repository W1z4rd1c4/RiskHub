import * as axe from 'axe-core';
import { useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { render, screen, userEvent, waitFor } from '@test/render';
import { useTranslation } from '@/i18n/hooks';

// --- Real dialog / alertdialog surfaces under test -------------------------
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ArchiveConfirmDialog } from '@/components/ArchiveConfirmDialog';
import { KriMismatchDialog } from '@/components/kri-form/KriMismatchDialog';
import { RoleDeleteDialog } from '@/components/riskhub/roles/RoleDeleteDialog';
import { RoleModal } from '@/components/riskhub/roles/RoleModal';
import { RiskHubModalFrame } from '@/components/riskhub/panelPrimitives';
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

async function expectNoAxeViolations(node: Element | Document = document.body): Promise<void> {
    const results = await axe.run(node as Element, {
        runOnly: { type: 'tag', values: AXE_TAGS },
        // Contrast is theme-token driven and covered by the P1 contrast suite.
        rules: { 'color-contrast': { enabled: false } },
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

/**
 * Drives the full seven-point DialogShell contract against a real surface:
 * correct role, an accessible name, initial focus inside, Tab + Shift-Tab stay
 * trapped, Escape closes, focus restores to the opener, and no axe violations
 * while open.
 */
async function assertDialogContract(role: Role, renderSurface: RenderSurface): Promise<void> {
    const user = userEvent.setup();
    render(<SurfaceHarness renderSurface={renderSurface} />);

    const launch = screen.getByRole('button', { name: 'launch' });
    launch.focus();
    await user.click(launch);

    const surface = await screen.findByRole(role);

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

    // Tab stays trapped (cycle well past the focusable count).
    for (let i = 0; i < 8; i += 1) {
        await user.tab();
        expect(surface.contains(document.activeElement)).toBe(true);
    }
    // Shift+Tab stays trapped too.
    for (let i = 0; i < 8; i += 1) {
        await user.tab({ shift: true });
        expect(surface.contains(document.activeElement)).toBe(true);
    }

    // Open-state axe sweep with the shared pinned tags.
    await expectNoAxeViolations(document.body);

    // Escape closes and restores focus to the opener.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole(role)).not.toBeInTheDocument());
    await waitFor(() => expect(launch).toHaveFocus());
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
    capabilities: {},
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
    capabilities: null,
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
    it('ConfirmDialog', async () => {
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

    it('ArchiveConfirmDialog', async () => {
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

    it('KriMismatchDialog', async () => {
        await assertDialogContract('alertdialog', (onClose) => (
            <KriMismatchDialog
                isSubmitting={false}
                onCancel={onClose}
                onContinueWithoutLinking={() => {}}
                onLinkRiskAndContinue={() => {}}
            />
        ));
    });

    it('RoleDeleteDialog', async () => {
        await assertDialogContract('alertdialog', (onClose) => (
            <RoleDeleteDialog onCancel={onClose} onConfirm={() => {}} role={roleFixture} />
        ));
    });
});

describe('Dialog interaction matrix — dialog surfaces (FR-P2c-1)', () => {
    it('RoleModal', async () => {
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

    it('RiskHubModalFrame (panelPrimitives)', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <RiskHubModalFrame title="Edit department" onClose={onClose}>
                <button type="button">Field</button>
            </RiskHubModalFrame>
        ));
    });

    it('AuditDetailsModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <AuditDetailsModal extra={{ action: 'update', field: 'name' }} onClose={onClose} />
        ));
    });

    it('BreakGlassEnableDialog', async () => {
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
    it('IssueQuickCreateModal', async () => {
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
    it('ApprovalResolutionDialog', async () => {
        await assertDialogContract('dialog', (onClose) => <ApprovalResolutionSurface onClose={onClose} />);
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (ExportDialog.tsx:76) + unlabeled date input (ExportDialog.tsx:91); axe button-name + label fail.
    it('ExportDialog', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <ExportDialog isOpen onClose={onClose} onSubmit={async () => {}} />
        ));
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (RiskQuickViewModal.tsx:55), axe button-name fails.
    it('RiskQuickViewModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <RiskQuickViewModal isOpen onClose={onClose} risk={riskFixture} />
        ));
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (ExecutionLogModal.tsx:74) + unlabeled form fields; axe button-name + label fail.
    it('ExecutionLogModal', async () => {
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
    it('KRIValueModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <KRIValueModal kri={kriFixture} isOpen onClose={onClose} onSuccess={() => {}} />
        ));
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (KRIHistoryEditModal.tsx:84) + unlabeled value/reason inputs; axe button-name + label fail.
    it('KRIHistoryEditModal', async () => {
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
    it('RiskDrilldownModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <RiskDrilldownModal isOpen onClose={onClose} probability={4} impact={4} />
        ));
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (OrphanQuickViewModal.tsx:128), axe button-name fails.
    it('OrphanQuickViewModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <OrphanQuickViewModal isOpen onClose={onClose} orphan={orphanFixture} />
        ));
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (ResolveOrphanModal.tsx:58), axe button-name fails.
    it('ResolveOrphanModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <ResolveOrphanModal isOpen onClose={onClose} orphan={orphanFixture} onResolved={() => {}} />
        ));
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (KriModalHeader.tsx:31), axe button-name fails.
    it('KRIModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <KRIModal
                risk_id={1}
                kri={null}
                isOpen
                onClose={onClose}
                onSave={async () => ({ kind: 'updated' })}
            />
        ));
    });

    // C5a — accessible-name fixed (was RED):icon-only close button lacks aria-label (AccessEditModalSections.tsx:26), axe button-name fails.
    it('AccessEditModal', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <AccessEditModal isOpen onClose={onClose} user={accessUserFixture} onSaved={() => {}} />
        ));
    });

    // C5a — accessible-name fixed (was RED):header close button lacks aria-label (RiskQuestionnaireDetailHeader) so axe button-name fails.
    it('RiskQuestionnaireDetail', async () => {
        await assertDialogContract('dialog', (onClose) => (
            <RiskQuestionnaireDetail
                isOpen
                onClose={onClose}
                questionnaireId={1}
                risk={riskFixture}
            />
        ));
    });
});

// ---------------------------------------------------------------------------
// Non-dialog busy overlay — must NOT be a dialog and must NOT transfer focus.
// ---------------------------------------------------------------------------

describe('ControlDetailPage loading overlay — role="status", not a dialog (FR-P2c-1)', () => {
    // Mirrors the real overlay at frontend/src/pages/ControlDetailPage.tsx:292-306
    // (role="status" aria-busy + fixed inset-0). It is deliberately NOT a
    // DialogShell: it exposes no dialog role, traps no focus, and must leave the
    // trigger focused. The overlay is action-gated (workflow.isLoadingRisk set in
    // useControlDetailWorkflow.ts:115), so its contract is asserted here directly.
    function LoadingOverlayHost() {
        return (
            <div>
                <button type="button">trigger</button>
                <div
                    role="status"
                    aria-busy="true"
                    className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]"
                >
                    <div className="glass-card !p-6 shadow-2xl flex flex-col items-center gap-4">
                        <div
                            aria-hidden="true"
                            className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin"
                        />
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                            Fetching risk details
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    it('exposes role="status"/aria-busy, no dialog role, and keeps focus on the trigger', async () => {
        render(<LoadingOverlayHost />);

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
