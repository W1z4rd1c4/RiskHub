import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Pencil } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PendingChangeCancellationDialog } from '@/components/approvals/PendingChangeCancellationDialog';
import { PendingChangePanel } from '@/components/approvals/PendingChangePanel';
import { CriticalityClassPill } from '@/components/ict-register/CriticalityClassPill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardTitle } from '@/components/ui/card';
import { InlineMessage } from '@/components/ui/inline-message';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAuthz } from '@/authz/useAuthz';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { useFeedback } from '@/hooks/useFeedback';
import { useTranslation, useFormat } from '@/i18n/hooks';
import { approvalsApi } from '@/services/approvalsApi';
import { logError } from '@/services/logger';
import { processApi } from '@/services/processApi';
import { isProcessApprovalQueuedResponse, type Process } from '@/types/process';

import { DetailField, DetailFieldList } from './detail/DetailField';
import { DetailLoadUnavailableState, DetailStaleWarning } from './detail/DetailLoadState';
import { DetailSection } from './detail/DetailSection';
import { EditBlockedState } from './detail/EditBlockedState';
import { EntityDetailHeader } from './detail/EntityDetailHeader';
import { OwnershipGovernanceAlert } from './detail/OwnershipGovernanceAlert';
import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { ProcessForm } from './processes/ProcessForm';
import { ProcessVendorLinksSection } from './processes/ProcessVendorLinksSection';
import { processMutationRequiresApprovalReason } from './processes/processProtectedEdit';
import {
    getProcessDisplayStatus,
    processDepartmentDisplayLabel,
    processControlledValueLabel,
    processDerivedCheckLabel,
    processDerivedCifLabel,
    processDerivedCriticalityLabel,
    processOwnerContextDisplayLabel,
    processOwnerDisplayLabel,
} from './processes/processesPagePresentation';
import { getProcessStatusTone } from './processes/processColumns';
import { useProcessDetailState, type ProcessDetailMode } from './processes/useProcessDetailState';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from './shared/registerReturnContext';
import { LoadingState } from '@/components/ui/state';

interface ProcessDetailPageProps {
    mode?: ProcessDetailMode;
}

function DerivedCheckField({
    code,
    label,
    value,
}: {
    code: string | null | undefined;
    label: string;
    value: string | null | undefined;
}) {
    // Blank check (workbook: OR(rto="",mtpd="") guard) renders a neutral dash.
    if (value === null || value === undefined) {
        return <DetailField label={label} value={null} />;
    }
    return (
        <DetailField
            label={label}
            value={(
                <span className={`font-semibold ${code === 'ok' ? 'text-success-text' : 'text-destructive'}`}>
                    {value}
                </span>
            )}
        />
    );
}

export function ProcessDetailPage({ mode = 'view' }: ProcessDetailPageProps) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/processes');
    const processDetailPath = (processId: number) => appendRegisterReturnTo(`/processes/${processId}`, returnTo);
    const authz = useAuthz();
    const { t } = useTranslation('processes');
    const { t: tCommon } = useTranslation('common');
    const format = useFormat();
    // D14 / AX-06: every back control names its destination.
    const backToRegister = { label: t('actions.back_to_register'), onClick: () => void navigate(returnTo) };
    const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [isCancellingPendingChange, setIsCancellingPendingChange] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pendingCancellation, setPendingCancellation] = useState<{
        approvalId: number;
        targetName: string;
    } | null>(null);
    const [pendingCancellationError, setPendingCancellationError] = useState<string | null>(null);

    const {
        canArchive,
        canEdit,
        canRestore,
        fetchProcess,
        isRetrying,
        loadOutcome,
        process,
        processId,
        restoreProcess,
        setProcess,
    } = useProcessDetailState({ mode });

    const createGateState = useCreateCapabilityGate({
        enabled: mode === 'new',
        load: useCallback(() => processApi.getProcesses({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load process create capabilities.',
    });

    const feedback = useFeedback();
    const announceApprovalQueued = useApprovalQueued();

    const archiveProcess = async (requestReason?: string) => {
        if (!process) {
            return;
        }
        try {
            setIsArchiving(true);
            setActionError(null);
            const result = await processApi.archiveProcess(process.id, requestReason?.trim() ?? '');
            setIsArchiveDialogOpen(false);
            if (isProcessApprovalQueuedResponse(result)) {
                // D12 / PM-2: stay on the process with the pending notice + toast.
                announceApprovalQueued({ approvalId: result.approval_id });
                void fetchProcess();
                return;
            }
            feedback.success({ title: tCommon('outcome.archived', { name: process.l1_process }) });
            void navigate(returnTo);
        } catch (archiveError) {
            logError('Failed to archive process:', archiveError);
            setActionError(t('errors.archive_failed'));
        } finally {
            setIsArchiving(false);
        }
    };

    const openPendingChangeCancellation = () => {
        if (!process?.pending_change) return;
        setPendingCancellationError(null);
        setPendingCancellation({
            approvalId: process.pending_change.approval_id,
            targetName: process.l1_process,
        });
    };

    const cancelPendingChange = async () => {
        if (!pendingCancellation || isCancellingPendingChange) return;
        try {
            setIsCancellingPendingChange(true);
            setPendingCancellationError(null);
            await approvalsApi.cancel(pendingCancellation.approvalId);
            setPendingCancellation(null);
            void fetchProcess();
        } catch (cancelError) {
            logError('Failed to cancel pending Process change:', cancelError);
            setPendingCancellationError(t('pending_change.cancel_failed'));
        } finally {
            setIsCancellingPendingChange(false);
        }
    };

    if (mode === 'new') {
        // D7 / D14: the page title, back control and breadcrumbs stay in place
        // while the create capability loads or is denied.
        const newHeader = (
            <PageHeader
                title={t('actions.new')}
                description={t('subtitle')}
                back={backToRegister}
                breadcrumbs={[{ label: t('title'), to: returnTo }, { label: t('actions.new') }]}
            />
        );
        if (createGateState.state !== 'allowed') {
            return (
                <PageContainer size="form">
                    {newHeader}
                    <FormCapabilityGateState state={createGateState.state} onRetry={createGateState.retry} />
                </PageContainer>
            );
        }
        return (
            <PageContainer size="form">
                {newHeader}
                <ProcessForm
                    onSaved={(saved: Process) => {
                        feedback.success({ title: tCommon('success.created'), description: saved.l1_process });
                        void navigate(processDetailPath(saved.id));
                    }}
                    onApprovalQueued={(queued) => announceApprovalQueued({ approvalId: queued.approval_id, to: returnTo })}
                    onCancel={() => navigate(returnTo)}
                />
            </PageContainer>
        );
    }

    if (loadOutcome === 'loading') {
        return (
            <LoadingState layout="page" label={tCommon('loading.generic')} />
        );
    }

    if (loadOutcome === 'unavailable' || !process) {
        return (
            <DetailLoadUnavailableState
                backLabel={t('actions.back_to_register')}
                isRetrying={isRetrying}
                onBack={() => navigate(returnTo)}
                onRetry={processId === null ? undefined : () => void fetchProcess()}
            />
        );
    }

    const staleWarning = loadOutcome === 'stale-with-error' ? (
        <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void fetchProcess()} />
    ) : null;
    const pendingCancellationDialog = (
        <PendingChangeCancellationDialog
            isOpen={pendingCancellation !== null}
            targetName={pendingCancellation?.targetName ?? ''}
            isLoading={isCancellingPendingChange}
            errorText={pendingCancellationError}
            onClose={() => {
                setPendingCancellation(null);
                setPendingCancellationError(null);
            }}
            onConfirm={() => void cancelPendingChange()}
        />
    );

    const editBack = {
        label: tCommon('actions.back_to_detail', { name: process.l1_process }),
        onClick: () => void navigate(processDetailPath(process.id)),
    };
    const editBreadcrumbs = [
        { label: t('title'), to: returnTo },
        { label: process.l1_process, to: processDetailPath(process.id) },
        { label: t('actions.edit') },
    ];
    const pendingChangePanel = process.pending_change ? (
        <PendingChangePanel
            pendingChange={process.pending_change}
            namespace="processes"
            testIdPrefix="process"
            cancelling={isCancellingPendingChange}
            onCancel={openPendingChangeCancellation}
        />
    ) : null;
    // SM-05: one ownership banner for pending-governance / legacy / invalid
    // ownership; only the governance case offers the queue action.
    const ownershipAlert = (testId?: string) => {
        if (process.ownership_status === 'pending_governance') {
            return (
                <OwnershipGovernanceAlert
                    message={t(authz.canViewGovernance
                        ? 'messages.owner_orphaned_governance'
                        : 'messages.owner_orphaned_request')}
                    actionLabel={t('actions.resolve_in_governance')}
                    onAction={authz.canViewGovernance ? () => navigate('/governance?type=process') : undefined}
                    testId={testId}
                    actionTestId="process-orphan-governance"
                />
            );
        }
        if (process.ownership_status === 'legacy_unassigned') {
            return <OwnershipGovernanceAlert message={t('messages.ownership_legacy_unassigned')} />;
        }
        if (process.ownership_status === 'invalid_assignment') {
            return <OwnershipGovernanceAlert message={t('messages.ownership_invalid_assignment')} />;
        }
        return null;
    };

    const editHeader = (
        <PageHeader
            title={t('actions.edit')}
            description={process.l1_process}
            documentTitle={tCommon('page_title.edit', { name: process.l1_process })}
            back={editBack}
            breadcrumbs={editBreadcrumbs}
        />
    );

    if (mode === 'edit') {
        if (process.capabilities?.business_edit_blocked || process.pending_change) {
            return (
                <>
                    <EditBlockedState
                        notice={staleWarning}
                        title={t('pending_change.edit_blocked_title')}
                        entityName={process.l1_process}
                        documentTitle={tCommon('page_title.edit', { name: process.l1_process })}
                        back={editBack}
                        breadcrumbs={editBreadcrumbs}
                        reason={process.pending_change ? undefined : t('pending_change.business_edits_blocked')}
                        testId="process-edit-blocked"
                    >
                        {actionError ? <InlineMessage tone="danger">{actionError}</InlineMessage> : null}
                        {pendingChangePanel}
                    </EditBlockedState>
                    {pendingCancellationDialog}
                </>
            );
        }
        if (process.ownership_status === 'pending_governance') {
            return (
                <PageContainer>
                    {staleWarning}
                    {editHeader}
                    {ownershipAlert('process-orphan-edit-blocked')}
                </PageContainer>
            );
        }
        if (canEdit !== true) {
            return (
                <PageContainer size="form">
                    {editHeader}
                    <FormCapabilityGateState state="denied" />
                </PageContainer>
            );
        }
        return (
            <PageContainer size="form">
                {staleWarning}
                {editHeader}
                {ownershipAlert()}
                <ProcessForm
                    initialData={process.ownership_status === 'invalid_assignment'
                        ? {
                            ...process,
                            process_owner_user_id: null,
                            owning_department_id: null,
                        }
                        : process}
                    isEdit
                    onApprovalQueued={(queued) => announceApprovalQueued({
                        approvalId: queued.approval_id,
                        to: processDetailPath(process.id),
                    })}
                    onSaved={(saved: Process) => {
                        setProcess(saved);
                        feedback.success({ title: tCommon('success.updated'), description: saved.l1_process });
                        void navigate(processDetailPath(saved.id));
                    }}
                    onCancel={() => navigate(processDetailPath(process.id))}
                />
            </PageContainer>
        );
    }

    const status = getProcessDisplayStatus(process);

    return (
        <PageContainer>
            {staleWarning}
            <ApprovalQueuedNotice />
            {pendingChangePanel}
            {ownershipAlert()}

            <EntityDetailHeader
                back={{ ...backToRegister, testId: 'process-detail-back' }}
                breadcrumbs={[{ label: t('title'), to: returnTo }, { label: process.l1_process }]}
                identifier={<span className="font-mono text-accent-text">{process.f_code}</span>}
                title={process.l1_process}
                documentTitle={process.l1_process}
                statuses={(
                    <Badge tone={getProcessStatusTone(status)}>{t(`status.${status}`)}</Badge>
                )}
                description={`${process.l0_area}${process.l2_subprocess ? ` · ${process.l2_subprocess}` : ''}`}
                actions={(
                    <>
                        {canRestore && (
                            <Button
                                variant="outline"
                                onClick={() => void restoreProcess()}
                                data-testid="process-detail-restore"
                            >
                                <ArchiveRestore aria-hidden="true" />
                                {t('actions.restore')}
                            </Button>
                        )}
                        {canEdit
                            && !process.capabilities?.business_edit_blocked
                            && !process.pending_change
                            && process.ownership_status !== 'pending_governance' && (
                            <Button
                                variant="outline"
                                onClick={() => navigate(appendRegisterReturnTo(`/processes/${process.id}/edit`, returnTo))}
                                data-testid="process-detail-edit"
                            >
                                <Pencil aria-hidden="true" />
                                {t('actions.edit')}
                            </Button>
                        )}
                        {canArchive && (
                            <Button
                                variant="destructive"
                                onClick={() => {
                                    setActionError(null);
                                    setIsArchiveDialogOpen(true);
                                }}
                                data-testid="process-detail-archive"
                            >
                                <Archive aria-hidden="true" />
                                {tCommon('actions.archive')}
                            </Button>
                        )}
                    </>
                )}
            />

            <DetailSection title={t('form.sections.ownership')}>
                <DetailFieldList className="md:grid-cols-3">
                    <DetailField
                        label={t('form.owner')}
                        value={processOwnerDisplayLabel(t, process)}
                    />
                    <DetailField
                        label={t('form.owner_context')}
                        value={processOwnerContextDisplayLabel(t, process)}
                    />
                    <DetailField
                        label={t('form.owner_department')}
                        value={processDepartmentDisplayLabel(t, process)}
                    />
                    <DetailField
                        label={t('form.licensed_activity')}
                        value={processControlledValueLabel(t, 'licensed_activity', process.licensed_activity)}
                    />
                </DetailFieldList>
            </DetailSection>

            <DetailSection title={t('form.sections.impacts')}>
                <DetailFieldList className="grid-cols-2 md:grid-cols-3">
                    <DetailField label={t('form.impact_client')} value={process.impact_client} />
                    <DetailField label={t('form.impact_market_operations')} value={process.impact_market_operations} />
                    <DetailField label={t('form.impact_regulatory')} value={process.impact_regulatory} />
                    <DetailField label={t('form.impact_financial')} value={process.impact_financial} />
                    <DetailField label={t('form.impact_reputational')} value={process.impact_reputational} />
                    <DetailField label={t('form.mtpd_hours')} value={process.mtpd_hours} />
                </DetailFieldList>
            </DetailSection>

            <DetailSection title={t('form.sections.criticality')}>
                <DetailFieldList className="grid-cols-2 md:grid-cols-3">
                    <DetailField
                        label={t('form.preliminary_criticality')}
                        value={processControlledValueLabel(t, 'preliminary_criticality', process.preliminary_criticality)}
                    />
                    <DetailField
                        label={t('form.cif_override')}
                        value={processControlledValueLabel(t, 'cif_override', process.cif_override)}
                    />
                </DetailFieldList>
            </DetailSection>

            {process.derived ? (
                <DetailSection title={t('derived.title')} testId="process-derived-section">
                    <div className="space-y-5">
                        <DetailFieldList className="grid-cols-2 md:grid-cols-4">
                            <DetailField
                                label={t('derived.criticality_score')}
                                value={process.derived.criticality_score}
                                testId="process-derived-score"
                            />
                            <DetailField
                                label={t('derived.criticality_class')}
                                value={(
                                    <CriticalityClassPill
                                        criticalityClass={process.derived.criticality_class}
                                        displayValue={processDerivedCriticalityLabel(t, process.derived.criticality_class)}
                                    />
                                )}
                            />
                            <DetailField
                                label={t('derived.cif')}
                                value={processDerivedCifLabel(t, process.derived.cif)}
                                testId="process-derived-cif"
                            />
                            <DetailField
                                label={t('derived.completeness')}
                                value={
                                    process.derived.is_complete
                                        ? `✓ ${t('derived.complete')}`
                                        : `⚠ ${t('derived.incomplete')}`
                                }
                            />
                            <DerivedCheckField
                                code={process.derived.rto_mtpd_check}
                                label={t('derived.rto_mtpd_check')}
                                value={processDerivedCheckLabel(t, process.derived.rto_mtpd_check)}
                            />
                            <DerivedCheckField
                                code={process.derived.bcm_check}
                                label={t('derived.bcm_check')}
                                value={processDerivedCheckLabel(t, process.derived.bcm_check)}
                            />
                            <DetailField label={t('derived.next_review_date')} value={format.date(process.derived.next_review_date)} />
                            <DetailField label={t('derived.linked_asset_count')} value={process.derived.linked_asset_count} />
                            <DetailField
                                label={t('derived.linked_vendor_count')}
                                value={process.derived.linked_vendor_count}
                                testId="process-derived-vendor-count"
                            />
                        </DetailFieldList>

                        <div
                            className="space-y-3 border-t border-border pt-4"
                            data-testid="process-derived-transitive"
                        >
                            <CardTitle as="h3">{t('derived.transitive.title')}</CardTitle>
                            {process.derived.transitive_vendor_links.length === 0 ? (
                                <p className="text-sm text-muted-foreground">{t('derived.transitive.empty')}</p>
                            ) : (
                                <Table density="compact">
                                    <THead>
                                        <TR>
                                            <TH>{t('derived.transitive.vendor')}</TH>
                                            <TH>{t('derived.transitive.via_asset')}</TH>
                                        </TR>
                                    </THead>
                                    <TBody>
                                        {process.derived.transitive_vendor_links.map((link, index) => (
                                            <TR
                                                key={`${link.vendor_id}-${link.via_asset_id}-${index}`}
                                                data-testid={`process-derived-transitive-row-${index}`}
                                            >
                                                <TD className="font-medium text-foreground">{link.vendor_name}</TD>
                                                <TD>{link.via_asset_name}</TD>
                                            </TR>
                                        ))}
                                    </TBody>
                                </Table>
                            )}
                        </div>

                        <div className="space-y-4 border-t border-border pt-4">
                            <CardTitle as="h3">{t('derived.inputs.title')}</CardTitle>
                            <DetailFieldList className="grid-cols-2 md:grid-cols-3">
                                <DetailField
                                    label={t('derived.inputs.impacts')}
                                    value={[
                                        process.derived.inputs.impact_client,
                                        process.derived.inputs.impact_market_operations,
                                        process.derived.inputs.impact_regulatory,
                                        process.derived.inputs.impact_financial,
                                    ]
                                        .map((axis) => axis ?? '—')
                                        .join(' / ')}
                                />
                                <DetailField
                                    label={t('derived.inputs.mtpd_bonus')}
                                    value={
                                        process.derived.inputs.mtpd_bonus != null
                                            ? `+${process.derived.inputs.mtpd_bonus}`
                                            : null
                                    }
                                />
                                <DetailField
                                    label={t('derived.inputs.thresholds')}
                                    value={`≥${process.derived.inputs.threshold_critical_score} / ≥${process.derived.inputs.threshold_high_score} / ≥${process.derived.inputs.threshold_medium_score}`}
                                />
                                <DetailField
                                    label={t('derived.inputs.class_source')}
                                    value={t(
                                        process.derived.inputs.criticality_class_source === 'score'
                                            ? 'derived.inputs.class_source_score'
                                            : 'derived.inputs.class_source_preliminary'
                                    )}
                                />
                                <DetailField
                                    label={t('derived.inputs.cif_override')}
                                    value={processControlledValueLabel(
                                        t,
                                        'cif_override',
                                        process.derived.inputs.cif_override,
                                    )}
                                />
                                <DetailField
                                    label={t('derived.inputs.missing')}
                                    value={
                                        process.derived.inputs.missing_for_completeness.length
                                            ? process.derived.inputs.missing_for_completeness
                                                  .map((field) => t(`form.${field}`))
                                                  .join(', ')
                                            : t('derived.inputs.none')
                                    }
                                />
                            </DetailFieldList>
                            <div className="flex flex-wrap gap-2">
                                {(
                                    [
                                        ['cif_class_critical', process.derived.inputs.cif_class_critical],
                                        ['cif_mtpd_within_critical', process.derived.inputs.cif_mtpd_within_critical],
                                        ['cif_any_impact_maximal', process.derived.inputs.cif_any_impact_maximal],
                                    ] as const
                                )
                                    .filter(([, active]) => active)
                                    .map(([key]) => (
                                        <Badge key={key} tone="danger">
                                            {t(`derived.inputs.${key}`)}
                                        </Badge>
                                    ))}
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">{t('detail.derived_fields_note')}</p>
                    </div>
                </DetailSection>
            ) : null}

            <DetailSection title={t('form.sections.continuity')}>
                <DetailFieldList className="grid-cols-2 md:grid-cols-3">
                    <DetailField label={t('form.rto_hours')} value={process.rto_hours} />
                    <DetailField label={t('form.rpo_hours')} value={process.rpo_hours} />
                    <DetailField
                        label={t('form.bcm_link')}
                        value={processControlledValueLabel(t, 'bcm_link', process.bcm_link)}
                    />
                    <DetailField label={t('form.last_dr_test_date')} value={format.date(process.last_dr_test_date)} />
                    <DetailField
                        label={t('form.dr_test_result')}
                        value={processControlledValueLabel(t, 'dr_test_result', process.dr_test_result)}
                    />
                </DetailFieldList>
            </DetailSection>

            <DetailSection title={t('form.sections.assessment')}>
                <DetailFieldList className="grid-cols-2 md:grid-cols-3">
                    <DetailField
                        label={t('form.interruption_impact')}
                        value={processControlledValueLabel(t, 'interruption_impact', process.interruption_impact)}
                    />
                    <DetailField label={t('form.assessment_date')} value={format.date(process.assessment_date)} />
                </DetailFieldList>
                {process.notes ? (
                    <DetailFieldList className="mt-5 md:grid-cols-1">
                        <DetailField label={t('form.notes')} value={process.notes} />
                    </DetailFieldList>
                ) : null}
            </DetailSection>

            <ProcessVendorLinksSection
                process={process}
                canManageLinks={canEdit === true && !process.capabilities?.business_edit_blocked && !process.pending_change}
                onLinksChanged={() => fetchProcess()}
            />

            {/* D10 / PM-1: the process API takes a reason; it is required
                only when the archive is routed through approval. */}
            <ConfirmDialog
                isOpen={isArchiveDialogOpen}
                onClose={() => {
                    setIsArchiveDialogOpen(false);
                    setActionError(null);
                }}
                onConfirm={archiveProcess}
                intent="archive"
                entityLabel={tCommon('labels.process')}
                message={t('messages.archive_confirm', { processName: process.l1_process })}
                isLoading={isArchiving}
                reason={processMutationRequiresApprovalReason(process) ? 'required' : 'optional'}
                reasonLabel={t('form.request_reason')}
                reasonPlaceholder={t('form.request_reason_help')}
                errorText={actionError}
            />
            {pendingCancellationDialog}
        </PageContainer>
    );
}

export default ProcessDetailPage;
