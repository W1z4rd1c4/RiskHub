import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Pencil } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PendingChangeCancellationDialog } from '@/components/approvals/PendingChangeCancellationDialog';
import { PendingChangePanel } from '@/components/approvals/PendingChangePanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthz } from '@/authz/useAuthz';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { useFeedback } from '@/hooks/useFeedback';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { logError } from '@/services/logger';
import { approvalsApi } from '@/services/approvalsApi';
import { threatApi } from '@/services/threatApi';
import type { Threat } from '@/types/threat';

import { DetailField, DetailFieldList } from './detail/DetailField';
import { DetailLoadUnavailableState, DetailStaleWarning } from './detail/DetailLoadState';
import { DetailSection } from './detail/DetailSection';
import { EditBlockedState } from './detail/EditBlockedState';
import { EntityDetailHeader } from './detail/EntityDetailHeader';
import { OwnershipGovernanceAlert } from './detail/OwnershipGovernanceAlert';
import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { ThreatForm } from './threats/ThreatForm';
import { ThreatRiskLinksSection } from './threats/ThreatRiskLinksSection';
import { getThreatDisplayStatus, threatCategoryLabel } from './threats/threatsPagePresentation';
import { getThreatStatusTone } from './threats/threatColumns';
import { useThreatDetailState, type ThreatDetailMode } from './threats/useThreatDetailState';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from './shared/registerReturnContext';
import { LoadingState } from '@/components/ui/state';

interface ThreatDetailPageProps {
    mode?: ThreatDetailMode;
}

export function ThreatDetailPage({ mode = 'view' }: ThreatDetailPageProps) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/threats');
    const threatDetailPath = (threatId: number) => appendRegisterReturnTo(`/threats/${threatId}`, returnTo);
    const authz = useAuthz();
    const { t } = useTranslation('threats');
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
                    onSaved={(saved: Threat) => {
                        feedback.success({ title: tCommon('success.created'), description: saved.name });
                        void navigate(threatDetailPath(saved.id));
                    }}
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

    const pendingChangePanel = threat.pending_change ? (
        <PendingChangePanel
            pendingChange={threat.pending_change}
            namespace="threats"
            testIdPrefix="threat"
            cancelling={isCancellingPendingChange}
            onCancel={openPendingChangeCancellation}
        />
    ) : null;
    // SM-05: one ownership banner for pending-governance / legacy / invalid
    // stewardship; only the governance case offers the queue action.
    const stewardshipAlert = (testId?: string) => {
        if (threat.stewardship_status === 'pending_governance') {
            return (
                <OwnershipGovernanceAlert
                    message={t(authz.canViewGovernance
                        ? 'messages.steward_orphaned_governance'
                        : 'messages.steward_orphaned_request')}
                    actionLabel={t('actions.resolve_in_governance')}
                    onAction={authz.canViewGovernance ? () => navigate('/governance?type=threat') : undefined}
                    testId={testId}
                    actionTestId="threat-orphan-governance"
                />
            );
        }
        if (threat.stewardship_status === 'legacy_unassigned') {
            return <OwnershipGovernanceAlert message={t('messages.stewardship_legacy_unassigned')} />;
        }
        if (threat.stewardship_status === 'invalid_assignment') {
            return <OwnershipGovernanceAlert message={t('messages.stewardship_invalid_assignment')} />;
        }
        return null;
    };

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
                        {pendingChangePanel}
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
                    {stewardshipAlert('threat-orphan-edit-blocked')}
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
                {stewardshipAlert()}
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
                        feedback.success({ title: tCommon('success.updated'), description: saved.name });
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
            {pendingChangePanel}
            {stewardshipAlert()}

            <EntityDetailHeader
                back={{ ...backToRegister, testId: 'threat-detail-back' }}
                breadcrumbs={[{ label: t('title'), to: returnTo }, { label: threat.name }]}
                title={threat.name}
                statuses={(
                    <Badge tone={getThreatStatusTone(status)}>{t(`status.${status}`)}</Badge>
                )}
                metadata={threat.category ? (
                    <span className="font-bold text-accent-text">{threatCategoryLabel(t, threat.category)}</span>
                ) : undefined}
                description={threat.relevant_subject || undefined}
                actions={(
                    <>
                        {canRestore && (
                            <Button
                                variant="outline"
                                onClick={() => void restoreThreat()}
                                data-testid="threat-detail-restore"
                            >
                                <ArchiveRestore aria-hidden="true" />
                                {t('actions.restore')}
                            </Button>
                        )}
                        {canEdit && !threat.pending_change && threat.stewardship_status !== 'pending_governance' && (
                            <Button
                                variant="outline"
                                onClick={() => navigate(appendRegisterReturnTo(`/threats/${threat.id}/edit`, returnTo))}
                                data-testid="threat-detail-edit"
                            >
                                <Pencil aria-hidden="true" />
                                {t('actions.edit')}
                            </Button>
                        )}
                        {canArchive && (
                            <Button
                                variant="destructive"
                                onClick={() => setIsArchiveDialogOpen(true)}
                                data-testid="threat-detail-archive"
                            >
                                <Archive aria-hidden="true" />
                                {tCommon('actions.archive')}
                            </Button>
                        )}
                    </>
                )}
            />

            <DetailSection title={t('form.sections.details')}>
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
            </DetailSection>

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
