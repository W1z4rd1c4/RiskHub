import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, Edit2, Target, Plus, Clock, History, RotateCcw } from 'lucide-react';
import { KRIModal } from '@/components/kri/KRIModal';
import { KRIValueModal } from '@/components/kri/KRIValueModal';
import { KRIHistoryEditModal } from '@/components/kri/KRIHistoryEditModal';
import { PageContainer } from '@/components/layout/PageContainer';
import { PendingChangeBadge } from '@/components/approvals/PendingChangeBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TabList, TabPanel } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { InlineMessage, type InlineMessageTone } from '@/components/ui/inline-message';
import { KRIDetailOverviewTab } from '@/components/kris/KRIDetailOverviewTab';
import { KRIDetailHistoryTab } from '@/components/kris/KRIDetailHistoryTab';
import { getKriMonitoringMeta } from '@/lib/monitoringStatus';
import { canArchive, resolveCapabilityFlag } from '@/lib/capabilities';
import { translateUiMessage, useFormat, useTranslation } from '@/i18n/hooks';
import { DetailLoadUnavailableState, DetailStaleWarning } from '@/pages/detail/DetailLoadState';
import { ContextualIssueAction } from '@/pages/detail/ContextualIssueAction';
import { EntityDetailHeader } from '@/pages/detail/EntityDetailHeader';
import { kriDetailTabs, useKriDetailState } from '@/pages/detail/useKriDetailState';
import { hasPendingKriApproval } from '@/pages/kris/kriColumns';
import { resolveRegisterReturnTo } from '@/pages/shared/registerReturnContext';
import { LoadingState, Skeleton } from '@/components/ui/state';

const KRI_TABS_ID_PREFIX = 'kri-detail';

/** Restore outcome → InlineMessage tone (role follows the tone, AX-05). */
const KRI_RESTORE_TONE: Readonly<Record<string, InlineMessageTone>> = {
    pending: 'info',
    success: 'success',
    archived: 'warning',
    rejected: 'danger',
    unknown: 'danger',
    denied: 'danger',
};

export function KRIDetailPage() {
    const { id } = useParams<{ id: string }>();
    return <KRIDetailRoute key={id ?? 'invalid'} rawId={id} />;
}

function KRIDetailRoute({ rawId }: { rawId: string | undefined }) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/kris');
    const { t } = useTranslation('common');
    const format = useFormat();
    const { t: tIssues } = useTranslation('issues');
    const {
        activeTab,
        canRecordValue,
        canRequestHistoryCorrection,
        deleteErrorKey,
        dueDate,
        handleDelete,
        handleRecordSuccess,
        restoreState,
        handleSave,
        history,
        historyOutcome,
        historyAccessDenied,
        historyPage,
        setHistoryPage,
        historyTotal,
        isDeleteDialogOpen,
        isDeleting,
        isEditModalOpen,
        isIssueModalOpen,
        isRetrying,
        isLoadingHistory,
        isOverdue,
        isValueModalOpen,
        kri,
        kriId,
        linkedRisk,
        linkedRiskOutcome,
        loadOutcome,
        refreshKri,
        refreshHistory,
        retryLinkedRisk,
        selectedHistoryEntry,
        setActiveTab,
        setDeleteErrorKey,
        setIsDeleteDialogOpen,
        setIsEditModalOpen,
        setIsIssueModalOpen,
        setIsValueModalOpen,
        setSelectedHistoryEntry,
    } = useKriDetailState({ rawId, returnTo });
    const registerLabel = t('navigation:sidebar.kris');
    // D14 / AX-06: the back control names its destination (the register the user came from).
    const backToRegister = { label: t('kris:actions.back_to_register'), onClick: () => void navigate(returnTo) };

    // formatNumber is still needed for overview tab
    const formatNumber = (val: number): string => {
        return format.metric(val);
    };

    if (loadOutcome === 'loading') {
        return (
            <div data-loading="true">
                <LoadingState
                    skeleton={(
                        <>
                            <Skeleton className="h-8 w-64 mb-8" />
                            <Skeleton className="h-64 rounded-2xl" />
                        </>
                    )}
                />
            </div>
        );
    }

    if (loadOutcome === 'unavailable' || !kri) {
        return (
            <DetailLoadUnavailableState
                backLabel={t('kris:actions.back_to_register')}
                isRetrying={isRetrying}
                onBack={() => navigate(returnTo)}
                onRetry={kriId === null ? undefined : () => void refreshKri()}
            />
        );
    }

    const monitoring = getKriMonitoringMeta(kri.monitoring_status);
    const MonitoringIcon = monitoring.icon;
    const canUpdateKri = resolveCapabilityFlag(kri.capabilities, 'can_update');
    const canArchiveKri = canArchive(kri.capabilities);
    const canCreateIssue = resolveCapabilityFlag(kri.capabilities, 'can_create_issue');

    return (
        <PageContainer>
            {loadOutcome === 'stale-with-error' ? (
                <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void refreshKri()} />
            ) : null}
            <EntityDetailHeader
                back={backToRegister}
                breadcrumbs={[{ label: registerLabel, to: returnTo }, { label: kri.metric_name }]}
                title={kri.metric_name}
                statuses={(
                    <>
                        <Badge icon={MonitoringIcon} className={monitoring.badgeClassName}>
                            {t(monitoring.labelKey)}
                        </Badge>
                        {isOverdue && (
                            <Badge tone="warning" icon={Clock}>
                                {t('kris:overdue.days_overdue', { count: kri.days_overdue ?? 0 })}
                            </Badge>
                        )}
                        {/* PG-29: the same pending-approval badge as the register row. */}
                        {hasPendingKriApproval(kri) ? <PendingChangeBadge /> : null}
                    </>
                )}
                description={kri.description || undefined}
                actions={(
                    <>
                        {canRecordValue && (
                            <Button variant="success" onClick={() => setIsValueModalOpen(true)}>
                                <Plus aria-hidden="true" /> {t('kris:value_modal.title')}
                            </Button>
                        )}
                        <ContextualIssueAction
                            buttonLabel={tIssues('actions.new_issue')}
                            canCreateIssue={canCreateIssue}
                            contextEntityId={kri.id}
                            contextEntityLabel={kri.metric_name}
                            contextEntityType="kri"
                            isOpen={isIssueModalOpen}
                            onClose={() => setIsIssueModalOpen(false)}
                            onCreated={(issue) => navigate(`/issues/${issue.id}`)}
                            onOpen={() => setIsIssueModalOpen(true)}
                        />
                        {canUpdateKri && (
                            <Button variant="outline" onClick={() => setIsEditModalOpen(true)}>
                                <Edit2 aria-hidden="true" /> {t('common:actions.edit')}
                            </Button>
                        )}
                        {kri.is_archived ? (
                            restoreState.canRestore && <Button
                                variant="outline"
                                onClick={() => void restoreState.restore()}
                                disabled={!restoreState.canSubmit}
                                isLoading={restoreState.outcome === 'pending'}
                                aria-describedby={restoreState.outcome !== 'idle' ? 'kri-restore-feedback' : undefined}
                            >
                                <RotateCcw aria-hidden="true" />
                                {restoreState.outcome === 'pending' ? t('kris:restore.pending')
                                    : ['rejected', 'archived'].includes(restoreState.outcome) ? t('kris:restore.retry')
                                        : t('common:actions.unarchive')}
                            </Button>
                        ) : (
                            canArchiveKri && <Button
                                variant="destructive"
                                onClick={() => {
                                    setDeleteErrorKey(null);
                                    setIsDeleteDialogOpen(true);
                                }}
                                disabled={isDeleting}
                            >
                                <Archive aria-hidden="true" /> {isDeleting ? t('common:confirm.archive.busy') : t('common:actions.archive')}
                            </Button>
                        )}
                    </>
                )}
            />

            {restoreState.outcome !== 'idle' ? (
                // AX-05 / D9: the restore outcome is an InlineMessage whose role
                // follows the tone (failures `alert`, the rest polite `status`);
                // it stays because it carries the reconcile action.
                <InlineMessage
                    id="kri-restore-feedback"
                    tone={KRI_RESTORE_TONE[restoreState.outcome]}
                    action={['unknown', 'denied'].includes(restoreState.outcome) && restoreState.canReconcile ? (
                        <Button variant="outline" onClick={() => void restoreState.reconcile()} isLoading={restoreState.isReconciling}>
                            {restoreState.isReconciling ? t('kris:restore.refreshing') : t('kris:restore.refresh')}
                        </Button>
                    ) : null}
                >
                    <p>{t(`kris:restore.${restoreState.outcome}`)}</p>
                    {restoreState.reconciliationFailed ? <p role="alert" className="mt-2">{t('kris:restore.refresh_failed')}</p> : null}
                </InlineMessage>
            ) : null}

            <ApprovalQueuedNotice />

            <TabList
                tabs={[
                    { id: kriDetailTabs[0], label: t('common:labels.overview'), icon: Target },
                    {
                        id: kriDetailTabs[1],
                        label: t('common:labels.history'),
                        icon: History,
                        count: ['content', 'empty', 'stale-with-error'].includes(historyOutcome.kind) ? historyTotal : undefined,
                    },
                ]}
                activeTab={activeTab}
                onChange={setActiveTab}
                idPrefix={KRI_TABS_ID_PREFIX}
                ariaLabel={kri.metric_name}
            />

            {/* Tab Content */}
            <TabPanel tab="overview" activeTab={activeTab} idPrefix={KRI_TABS_ID_PREFIX}>
                {activeTab === 'overview' && <KRIDetailOverviewTab
                    kri={kri}
                    linkedRisk={linkedRisk}
                    linkedRiskOutcome={linkedRiskOutcome}
                    onRetryLinkedRisk={() => void retryLinkedRisk()}
                    dueDate={dueDate}
                    formatNumber={formatNumber}
                />}
            </TabPanel>

            <TabPanel tab="history" activeTab={activeTab} idPrefix={KRI_TABS_ID_PREFIX}>
                {activeTab === 'history' && <KRIDetailHistoryTab
                    history={history}
                    historyTotal={historyTotal}
                    page={historyPage}
                    onPageChange={setHistoryPage}
                    isLoadingHistory={isLoadingHistory}
                    lowerLimit={kri.lower_limit}
                    upperLimit={kri.upper_limit}
                    unit={kri.unit}
                    onSelectEntry={setSelectedHistoryEntry}
                    canRequestCorrection={canRequestHistoryCorrection}
                    outcome={historyOutcome}
                    accessDenied={historyAccessDenied}
                    onRetry={() => kriId !== null && void refreshHistory(kriId)}
                />}
            </TabPanel>

            {/* Edit Modal */}
            {
                kri && isEditModalOpen && (
                    <KRIModal
                        kri={kri}
                        isOpen={isEditModalOpen}
                        onClose={() => setIsEditModalOpen(false)}
                        onSave={handleSave}
                    />
                )
            }

            {/* Record Value Modal: mounted only while open (PG-22) so its dirty-task
                route blocker never coexists with another guarded dialog's. */}
            {
                kri && isValueModalOpen && (
                    <KRIValueModal
                        kri={kri}
                        isOpen
                        onClose={() => setIsValueModalOpen(false)}
                        onSuccess={handleRecordSuccess}
                    />
                )
            }

            {/* History Edit Modal */}
            {
                kri && selectedHistoryEntry && historyOutcome.kind !== 'denied' && (
                    <KRIHistoryEditModal
                        isOpen={!!selectedHistoryEntry}
                        onClose={() => setSelectedHistoryEntry(null)}
                        kriId={kri.id}
                        entry={selectedHistoryEntry}
                        onSuccess={() => refreshHistory(kri.id)}
                        onError={() => refreshHistory(kri.id)}
                    />
                )
            }

            {kri && (
                <>
                    <ConfirmDialog
                        isOpen={isDeleteDialogOpen}
                        onClose={() => {
                            setDeleteErrorKey(null);
                            setIsDeleteDialogOpen(false);
                        }}
                        onConfirm={(reason) => handleDelete(reason)}
                        intent="archive"
                        entityLabel={t('kris:labels.entity')}
                        entityName={kri.metric_name}
                        reason="required"
                        isLoading={isDeleting}
                        errorText={deleteErrorKey ? translateUiMessage(t, deleteErrorKey) : null}
                    />
                </>
            )}
        </PageContainer>
    );
}

export default KRIDetailPage;
