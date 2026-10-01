import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Archive, ArchiveRestore, Pencil } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PendingChangeCancellationDialog } from '@/components/approvals/PendingChangeCancellationDialog';
import { useAuthz } from '@/authz/useAuthz';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { useFeedback } from '@/hooks/useFeedback';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { logError } from '@/services/logger';
import { approvalsApi } from '@/services/approvalsApi';
import { threatApi } from '@/services/threatApi';
import type { Threat } from '@/types/threat';

import { DetailField, DetailFieldList } from './detail/DetailField';
import { DetailLoadUnavailableState, DetailStaleWarning } from './detail/DetailLoadState';
import { EditBlockedState } from './detail/EditBlockedState';
import { EntityDetailHeader } from './detail/EntityDetailHeader';
import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { ThreatForm } from './threats/ThreatForm';
import { ThreatPendingChangePanel } from './threats/ThreatPendingChangePanel';
import { ThreatRiskLinksSection } from './threats/ThreatRiskLinksSection';
import { getThreatDisplayStatus, threatCategoryLabel } from './threats/threatsPagePresentation';
import { getThreatStatusColor } from './threats/threatColumns';
import { useThreatDetailState, type ThreatDetailMode } from './threats/useThreatDetailState';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from './shared/registerReturnContext';
import { LoadingState } from '@/components/ui/state';

interface ThreatDetailPageProps {
    mode?: ThreatDetailMode;
}

function StewardshipAlert({
    actionLabel,
    message,
    onResolve,
    testId,
}: {
    actionLabel?: string;
    message: string;
    onResolve?: () => void;
    testId?: string;
}) {
    return (
        <div
            role="alert"
            data-testid={testId}
            className="glass-card flex flex-col items-start gap-4 border border-warning/30 text-warning-text sm:flex-row sm:justify-between"
        >
            <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p className="text-sm font-medium">{message}</p>
            </div>
            {onResolve ? (
                <button
                    type="button"
                    onClick={onResolve}
                    data-testid="threat-orphan-governance"
                    className="shrink-0 rounded-xl border border-warning/30 px-4 py-2 text-sm font-bold text-warning-text transition-colors hover:bg-warning/10"
                >
                    {actionLabel}
                </button>
            ) : null}
        </div>
    );
}

export function ThreatDetailPage({ mode = 'view' }: ThreatDetailPageProps) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/threats');
    const threatDetailPath = (threatId: number) => appendRegisterReturnTo(`/threats/${threatId}`, returnTo);
    const authz = useAuthz();
    const { t } = useTranslation('threats');
    const format = useFormat();
    const { t: tCommon } = useTranslation('common');
    // D14 / AX-06: every back control names its destination.
    const backToRegister = { label: t('actions.back_to_register'), onClick: () => void navigate(returnTo) };
    const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isCancellingPendingChange, setIsCancellingPendingChange] = useState(false);
    const [pendingCancellation, setPendingCancellation] = useState<{
        approvalId: number;
        targetName: string;
    } | null>(null);
    const [pendingCancellationError, setPendingCancellationError] = useState<string | null>(null);

    const {
        canArchive,
        canEdit,
        canRestore,
        fetchThreat,
        isRetrying,
        loadOutcome,
        threatId,
        setThreat,
        threat,
        restoreThreat,
    } = useThreatDetailState({ mode });

    const createGateState = useCreateCapabilityGate({
        enabled: mode === 'new',
        load: useCallback(() => threatApi.getThreats({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load threat create capabilities.',
    });

    const feedback = useFeedback();
    const announceApprovalQueued = useApprovalQueued();

    // D10 / PG-07: a failed archive keeps the dialog open with the error
    // inside it (the threat API takes no reason, PM-1).
    const archiveThreat = async () => {
        if (!threat) {
            return;
        }
        try {
            setIsArchiving(true);
            setActionError(null);
            await threatApi.archiveThreat(threat.id);
            setIsArchiveDialogOpen(false);
            feedback.success({ title: tCommon('outcome.archived', { name: threat.name }) });
            void navigate(returnTo);
        } catch (archiveError) {
            logError('Failed to archive threat:', archiveError);
            setActionError(t('errors.archive_failed'));
        } finally {
            setIsArchiving(false);
        }
    };

    const openPendingChangeCancellation = () => {
        if (!threat?.pending_change?.approval_id) return;
        setPendingCancellationError(null);
        setPendingCancellation({
            approvalId: threat.pending_change.approval_id,
            targetName: threat.name,
        });
    };

    const cancelPendingChange = async () => {
        if (!pendingCancellation || isCancellingPendingChange) return;
        try {
            setIsCancellingPendingChange(true);
            setPendingCancellationError(null);
            await approvalsApi.cancel(pendingCancellation.approvalId);
            setPendingCancellation(null);
            void fetchThreat();
        } catch (cancelError) {
            logError('Failed to cancel pending Threat change:', cancelError);
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
                <ThreatForm
                    onSaved={(saved: Threat) => navigate(threatDetailPath(saved.id))}
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

    if (loadOutcome === 'unavailable' || !threat) {
        return (
            <DetailLoadUnavailableState
                backLabel={t('actions.back_to_register')}
                isRetrying={isRetrying}
                onBack={() => navigate(returnTo)}
                onRetry={threatId === null ? undefined : () => void fetchThreat()}
            />
        );
    }

    const staleWarning = loadOutcome === 'stale-with-error' ? (
        <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void fetchThreat()} />
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

    const editHeader = (
        <PageHeader
            title={t('actions.edit')}
            description={threat.name}
            documentTitle={tCommon('page_title.edit', { name: threat.name })}
            back={{
                label: tCommon('actions.back_to_detail', { name: threat.name }),
                onClick: () => void navigate(threatDetailPath(threat.id)),
            }}
            breadcrumbs={[
                { label: t('title'), to: returnTo },
                { label: threat.name, to: threatDetailPath(threat.id) },
                { label: t('actions.edit') },
            ]}
        />
    );

    if (mode === 'edit') {
        if (resolveCapabilityFlag(threat.capabilities, 'business_edit_blocked')) {
            return (
                <>
                    <EditBlockedState
                        notice={staleWarning}
                        entityName={threat.name}
                        documentTitle={tCommon('page_title.edit', { name: threat.name })}
                        back={{
                            label: tCommon('actions.back_to_detail', { name: threat.name }),
                            to: threatDetailPath(threat.id),
                        }}
                        breadcrumbs={[
                            { label: t('title'), to: returnTo },
                            { label: threat.name, to: threatDetailPath(threat.id) },
                            { label: t('actions.edit') },
                        ]}
                        testId="threat-edit-blocked"
                    >
                        {threat.pending_change ? (
                            <ThreatPendingChangePanel
                                pendingChange={threat.pending_change}
                                locale={format.locale}
                                cancelling={isCancellingPendingChange}
                                onCancel={resolveCapabilityFlag(threat.pending_change.capabilities, 'can_cancel')
                                    ? openPendingChangeCancellation
                                    : undefined}
                            />
                        ) : null}
                    </EditBlockedState>
                    {pendingCancellationDialog}
                </>
            );
        }
        if (threat.stewardship_status === 'pending_governance') {
            return (
                <PageContainer>
                    {staleWarning}
                    {editHeader}
                    <StewardshipAlert
                        actionLabel={t('actions.resolve_in_governance')}
                        message={t(authz.canViewGovernance
                            ? 'messages.steward_orphaned_governance'
                            : 'messages.steward_orphaned_request')}
                        onResolve={authz.canViewGovernance
                            ? () => navigate('/governance?type=threat')
                            : undefined}
                        testId="threat-orphan-edit-blocked"
                    />
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
                {threat.stewardship_status === 'legacy_unassigned' ? (
                    <StewardshipAlert message={t('messages.stewardship_legacy_unassigned')} />
                ) : null}
                {threat.stewardship_status === 'invalid_assignment' ? (
                    <StewardshipAlert message={t('messages.stewardship_invalid_assignment')} />
                ) : null}
                <ThreatForm
                    initialData={threat.stewardship_status === 'invalid_assignment'
                        ? { ...threat, threat_steward_user_id: null }
                        : threat}
                    isEdit
                    onApprovalQueued={(queued) => announceApprovalQueued({
                        approvalId: queued.approval_id,
                        to: threatDetailPath(threat.id),
                    })}
                    onSaved={(saved: Threat) => {
                        // The edit and view routes share the same detail-query
                        // key. Replace its cached pre-edit snapshot before
                        // navigating so the saved controlled values render
                        // immediately instead of waiting for stale-time expiry.
                        setThreat(saved);
                        void navigate(threatDetailPath(saved.id));
                    }}
                    onCancel={() => navigate(threatDetailPath(threat.id))}
                />
            </PageContainer>
        );
    }

    const status = getThreatDisplayStatus(threat);

    return (
        <PageContainer>
            {staleWarning}
            <ApprovalQueuedNotice />
            {threat.pending_change ? (
                <ThreatPendingChangePanel
                    pendingChange={threat.pending_change}
                    locale={format.locale}
                    cancelling={isCancellingPendingChange}
                    onCancel={resolveCapabilityFlag(threat.pending_change.capabilities, 'can_cancel')
                        ? openPendingChangeCancellation
                        : undefined}
                />
            ) : null}
            {threat.stewardship_status === 'pending_governance' ? (
                <StewardshipAlert
                    actionLabel={t('actions.resolve_in_governance')}
                    message={t(authz.canViewGovernance
                        ? 'messages.steward_orphaned_governance'
                        : 'messages.steward_orphaned_request')}
                    onResolve={authz.canViewGovernance
                        ? () => navigate('/governance?type=threat')
                        : undefined}
                />
            ) : null}
            {threat.stewardship_status === 'legacy_unassigned' ? (
                <StewardshipAlert message={t('messages.stewardship_legacy_unassigned')} />
            ) : null}
            {threat.stewardship_status === 'invalid_assignment' ? (
                <StewardshipAlert message={t('messages.stewardship_invalid_assignment')} />
            ) : null}

            <EntityDetailHeader
                back={{ ...backToRegister, testId: 'threat-detail-back' }}
                breadcrumbs={[{ label: t('title'), to: returnTo }, { label: threat.name }]}
                title={threat.name}
                statuses={(
                    <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getThreatStatusColor(status)}`}
                    >
                        {t(`status.${status}`)}
                    </span>
                )}
                metadata={threat.category ? (
                    <span className="font-bold text-accent-text">{threatCategoryLabel(t, threat.category)}</span>
                ) : undefined}
                description={threat.relevant_subject || undefined}
                actions={(
                    <>
                        {canRestore && (
                            <button
                                type="button"
                                onClick={() => void restoreThreat()}
                                data-testid="threat-detail-restore"
                                className="px-4 py-2.5 glass rounded-xl text-foreground hover:bg-tint/10 transition-colors flex items-center gap-2 text-sm font-semibold"
                            >
                                <ArchiveRestore className="h-4 w-4" />
                                {t('actions.restore')}
                            </button>
                        )}
                        {canEdit && !threat.pending_change && threat.stewardship_status !== 'pending_governance' && (
                            <button
                                type="button"
                                onClick={() => navigate(appendRegisterReturnTo(`/threats/${threat.id}/edit`, returnTo))}
                                data-testid="threat-detail-edit"
                                className="px-4 py-2.5 glass rounded-xl text-foreground hover:bg-tint/10 transition-colors flex items-center gap-2 text-sm font-semibold"
                            >
                                <Pencil className="h-4 w-4" />
                                {t('actions.edit')}
                            </button>
                        )}
                        {canArchive && (
                            <button
                                type="button"
                                onClick={() => setIsArchiveDialogOpen(true)}
                                data-testid="threat-detail-archive"
                                className="px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 transition-colors flex items-center gap-2 text-sm font-semibold"
                            >
                                <Archive className="h-4 w-4" aria-hidden="true" />
                                {tCommon('actions.archive')}
                            </button>
                        )}
                    </>
                )}
            />

            <div className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    {t('form.sections.details')}
                </h2>
                <DetailFieldList>
                    <DetailField label={t('form.category')} value={threatCategoryLabel(t, threat.category)} testId="threat-detail-category" />
                    <DetailField
                        label={t('form.steward')}
                        value={threat.threat_steward
                            ? `${threat.threat_steward.name} — ${threat.threat_steward.email}`
                            : undefined}
                        testId="threat-detail-steward"
                    />
                    <DetailField label={t('form.relevant_subject')} value={threat.relevant_subject} />
                    <DetailField label={t('form.description')} value={threat.description} />
                    <DetailField label={t('form.typical_weaknesses')} value={threat.typical_weaknesses} />
                    {threat.notes ? (
                        <DetailField label={t('form.notes')} value={threat.notes} className="md:col-span-2" />
                    ) : null}
                </DetailFieldList>
            </div>

            <ThreatRiskLinksSection
                threat={threat}
                canManageLinks={canEdit === true && !threat.pending_change}
                onLinksChanged={() => fetchThreat()}
            />

            <ConfirmDialog
                isOpen={isArchiveDialogOpen}
                onClose={() => {
                    setIsArchiveDialogOpen(false);
                    setActionError(null);
                }}
                onConfirm={archiveThreat}
                intent="archive"
                entityLabel={tCommon('labels.threat')}
                message={t('messages.archive_confirm', { threatName: threat.name })}
                isLoading={isArchiving}
                errorText={actionError}
            />
            {pendingCancellationDialog}
        </PageContainer>
    );
}

export default ThreatDetailPage;
