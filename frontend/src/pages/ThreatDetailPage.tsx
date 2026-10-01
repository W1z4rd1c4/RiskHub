import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArchiveRestore, ArrowLeft, Pencil, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PendingChangeCancellationDialog } from '@/components/approvals/PendingChangeCancellationDialog';
import { useAuthz } from '@/authz/useAuthz';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { logError } from '@/services/logger';
import { approvalsApi } from '@/services/approvalsApi';
import { threatApi } from '@/services/threatApi';
import type { Threat } from '@/types/threat';

import { DetailField, DetailFieldList } from './detail/DetailField';
import { DetailLoadUnavailableState, DetailStaleWarning } from './detail/DetailLoadState';
import { EditBlockedState } from './detail/EditBlockedState';
import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { ThreatForm } from './threats/ThreatForm';
import { ThreatPendingChangePanel } from './threats/ThreatPendingChangePanel';
import { ThreatRiskLinksSection } from './threats/ThreatRiskLinksSection';
import { getThreatDisplayStatus, threatCategoryLabel } from './threats/threatsPagePresentation';
import { getThreatStatusColor } from './threats/threatColumns';
import { useThreatDetailState, type ThreatDetailMode } from './threats/useThreatDetailState';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from './shared/registerReturnContext';

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
    const { t, i18n } = useTranslation('threats');
    const { t: tCommon } = useTranslation('common');
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

    const archiveThreat = async () => {
        if (!threat) {
            return;
        }
        try {
            setIsArchiving(true);
            await threatApi.archiveThreat(threat.id);
            void navigate(returnTo);
        } catch (archiveError) {
            logError('Failed to archive threat:', archiveError);
            setActionError(t('errors.archive_failed'));
        } finally {
            setIsArchiving(false);
            setIsArchiveDialogOpen(false);
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
        if (createGateState.state !== 'allowed') {
            return <FormCapabilityGateState state={createGateState.state} onRetry={createGateState.retry} />;
        }
        return (
            <div className="space-y-8">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={() => navigate(returnTo)}
                        aria-label={t('actions.back_to_register')}
                        className="p-2.5 glass rounded-xl text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">{t('actions.new')}</h1>
                        <p className="text-muted-foreground font-medium mt-1">{t('subtitle')}</p>
                    </div>
                </div>
                <ThreatForm
                    onSaved={(saved: Threat) => navigate(threatDetailPath(saved.id))}
                    onCancel={() => navigate(returnTo)}
                />
            </div>
        );
    }

    if (loadOutcome === 'loading') {
        return (
            <div className="glass-card text-sm text-muted-foreground">{tCommon('loading.generic')}</div>
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

    if (mode === 'edit') {
        if (resolveCapabilityFlag(threat.capabilities, 'business_edit_blocked')) {
            return (
                <>
                    <EditBlockedState
                        notice={staleWarning}
                        entityName={threat.name}
                        documentTitle={threat.name}
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
                                locale={i18n.language}
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
                <div className="space-y-8">
                    {staleWarning}
                    <div className="flex items-start gap-3">
                        <button
                            type="button"
                            onClick={() => navigate(threatDetailPath(threat.id))}
                            aria-label={t('actions.back_to_register')}
                            className="p-2.5 glass rounded-xl text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">{t('actions.edit')}</h1>
                            <p className="text-muted-foreground font-medium mt-1">{threat.name}</p>
                        </div>
                    </div>
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
                </div>
            );
        }
        if (canEdit !== true) {
            return <FormCapabilityGateState state="denied" />;
        }
        return (
            <div className="space-y-8">
                {staleWarning}
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={() => navigate(threatDetailPath(threat.id))}
                        aria-label={t('actions.back_to_register')}
                        className="p-2.5 glass rounded-xl text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">{t('actions.edit')}</h1>
                        <p className="text-muted-foreground font-medium mt-1">{threat.name}</p>
                    </div>
                </div>
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
                    onApprovalQueued={(queued) => {
                        void navigate(`/approvals?tab=mine&approvalId=${queued.approval_id}`);
                    }}
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
            </div>
        );
    }

    const status = getThreatDisplayStatus(threat);

    return (
        <div className="space-y-8">
            {staleWarning}
            {actionError ? (
                <div className="glass-card flex items-start gap-3 border border-destructive/30 text-destructive">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{actionError}</p>
                </div>
            ) : null}
            {threat.pending_change ? (
                <ThreatPendingChangePanel
                    pendingChange={threat.pending_change}
                    locale={i18n.language}
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

            <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={() => navigate(returnTo)}
                        data-testid="threat-detail-back"
                        aria-label={t('actions.back_to_register')}
                        className="p-2.5 glass rounded-xl text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            {threat.category ? (
                                <span className="text-xs font-bold text-accent-text">{threatCategoryLabel(t, threat.category)}</span>
                            ) : null}
                            <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getThreatStatusColor(status)}`}
                            >
                                {t(`status.${status}`)}
                            </span>
                        </div>
                        <h1 className="text-3xl font-bold text-foreground mt-1">{threat.name}</h1>
                        {threat.relevant_subject ? (
                            <p className="text-muted-foreground font-medium mt-1">{threat.relevant_subject}</p>
                        ) : null}
                    </div>
                </div>
                <div className="flex items-center gap-3">
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
                            <Trash2 className="h-4 w-4" />
                            {tCommon('actions.archive')}
                        </button>
                    )}
                </div>
            </div>

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
                onClose={() => setIsArchiveDialogOpen(false)}
                onConfirm={archiveThreat}
                title={tCommon('actions.archive')}
                message={t('messages.archive_confirm', { threatName: threat.name })}
                confirmLabel={tCommon('actions.archive')}
                variant="danger"
                isLoading={isArchiving}
            />
            {pendingCancellationDialog}
        </div>
    );
}

export default ThreatDetailPage;
