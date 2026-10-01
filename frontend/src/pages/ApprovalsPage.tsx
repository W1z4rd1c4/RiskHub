import { useNavigate } from 'react-router-dom';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { Search } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Pagination } from '@/components/tables/Pagination';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/state';
import { ApprovalList } from './approvals/ApprovalList';
import { ApprovalResolutionDialog } from './approvals/ApprovalResolutionDialog';
import { ApprovalsTabs } from './approvals/ApprovalsTabs';
import { QuestionnaireInboxList } from './approvals/QuestionnaireInboxList';
import { useApprovalsPageState } from './approvals/useApprovalsPageState';

export default function ApprovalsPage() {
    const { t } = useTranslation('approvals');
    const format = useFormat();
    const navigate = useNavigate();
    const {
        approvals,
        approvalTotal,
        approvalSkip,
        approvalLimit,
        approvalPageAvailable,
        approvalPaginationAvailable,
        skippedCorruptPayloads,
        linkedApprovalState,
        retryLinkedApproval,
        questionnaires,
        questionnairesOutcome,
        loading,
        filter,
        query,
        page,
        setFilter,
        setQuery,
        setPage,
        selectedApproval,
        dialogMode,
        resolutionNotes,
        setResolutionNotes,
        isSubmitting,
        approvalQueueErrorKey,
        resolutionErrorKey,
        cancelApprovalId,
        cancelErrorKey,
        isCancelling,
        expandedRows,
        openApproveDialog,
        openRejectDialog,
        closeDialog,
        toggleRow,
        handleResolve,
        requestCancel,
        dismissCancel,
        confirmCancel,
        refreshActiveView,
        retryQuestionnaires,
    } = useApprovalsPageState();
    const translateError = (errorKey: string | null) => {
        if (!errorKey) return null;
        return errorKey.startsWith('errorKeys.')
            ? t(errorKey, { ns: 'errorKeys' })
            : t(errorKey);
    };
    const rangeStart = approvalTotal === 0 ? 0 : approvalSkip + 1;
    const rangeEnd = approvalTotal === 0
        ? 0
        : Math.min(approvalSkip + approvalLimit, approvalTotal);
    const rangeValues = { start: rangeStart, end: rangeEnd, total: approvalTotal };
    const rangeText = loading
        ? t('workbench.page_loading')
        : skippedCorruptPayloads > 0
            ? t('workbench.range_incomplete', rangeValues)
            : t('workbench.range', rangeValues);

    return (
        <PageContainer>
            <PageHeader title={t('title')} description={t('page_subtitle')} />

            {filter !== 'risk_assessment' && approvalQueueErrorKey && (
                <ErrorState
                    variant="banner"
                    message={translateError(approvalQueueErrorKey)}
                    onRetry={refreshActiveView}
                />
            )}

            <ApprovalsTabs filter={filter} onChange={setFilter} t={t} label={t('title')}>
                {filter === 'risk_assessment' ? (
                    <QuestionnaireInboxList
                        questionnaires={questionnaires}
                        outcome={questionnairesOutcome}
                        locale={format.locale}
                        onOpenRisk={(riskId) => navigate(`/risks/${riskId}`)}
                        onRetry={() => void retryQuestionnaires()}
                        t={t}
                    />
                ) : (
                    <div className="space-y-4">
                        <div className="max-w-md">
                            <label htmlFor="approval-search" className="sr-only">
                                {t('workbench.search_label')}
                            </label>
                            <Input
                                id="approval-search"
                                type="search"
                                leadingIcon={Search}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={t('workbench.search_placeholder')}
                            />
                        </div>

                        {(loading || approvalPageAvailable) && (
                            <ApprovalList
                                approvals={approvals}
                                loading={loading}
                                expandedRows={expandedRows}
                                locale={format.locale}
                                onToggleRow={toggleRow}
                                onApprove={openApproveDialog}
                                onReject={openRejectDialog}
                                onCancel={requestCancel}
                                t={t}
                            />
                        )}

                        {!loading && approvalPageAvailable && skippedCorruptPayloads > 0 && (
                            <div role="alert" className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-text">
                                {t('workbench.incomplete', { count: skippedCorruptPayloads })}
                            </div>
                        )}

                        {approvalPaginationAvailable && (
                            <Pagination
                                mode="cursor"
                                ariaLabel={t('workbench.pagination_label')}
                                hasPrevious={approvalSkip > 0}
                                hasNext={approvalSkip + approvalLimit < approvalTotal}
                                isLoading={loading}
                                onPrevious={() => setPage(page - 1)}
                                onNext={() => setPage(page + 1)}
                                summary={<span role={loading ? 'status' : undefined}>{rangeText}</span>}
                            />
                        )}
                    </div>
                )}
            </ApprovalsTabs>

            {linkedApprovalState.kind !== 'idle' && (
                <section
                    aria-labelledby="linked-approval-title"
                    className="space-y-4 rounded-2xl border border-accent/20 bg-accent/5 p-4"
                >
                    <div>
                        <h2 id="linked-approval-title" className="text-lg font-bold text-foreground">
                            {t('workbench.linked_title')}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {t('workbench.linked_description')}
                        </p>
                    </div>

                    {linkedApprovalState.kind === 'loading' && (
                        <p role="status" className="text-sm text-muted-foreground">
                            {t('workbench.linked_loading')}
                        </p>
                    )}
                    {linkedApprovalState.kind === 'unavailable' && (
                        <p role="status" className="text-sm text-muted-foreground">
                            {t('workbench.linked_unavailable')}
                        </p>
                    )}
                    {linkedApprovalState.kind === 'error' && (
                        <div role="alert" className="flex items-center justify-between gap-4 text-sm text-destructive">
                            <span>{t('workbench.linked_load_failed')}</span>
                            <button
                                type="button"
                                onClick={retryLinkedApproval}
                                className="rounded-lg border border-current px-3 py-2 font-semibold"
                            >
                                {t('workbench.linked_retry')}
                            </button>
                        </div>
                    )}
                    {linkedApprovalState.kind === 'content' && (
                        <ApprovalList
                            approvals={[linkedApprovalState.approval]}
                            loading={false}
                            expandedRows={expandedRows}
                            locale={format.locale}
                            onToggleRow={toggleRow}
                            onApprove={openApproveDialog}
                            onReject={openRejectDialog}
                            onCancel={requestCancel}
                            t={t}
                        />
                    )}
                </section>
            )}

            <ApprovalResolutionDialog
                selectedApproval={selectedApproval}
                dialogMode={dialogMode}
                locale={format.locale}
                resolutionNotes={resolutionNotes}
                errorText={translateError(resolutionErrorKey)}
                isSubmitting={isSubmitting}
                onClose={closeDialog}
                onResolve={handleResolve}
                onResolutionNotesChange={setResolutionNotes}
                t={t}
            />

            <ConfirmDialog
                isOpen={cancelApprovalId !== null}
                onClose={dismissCancel}
                onConfirm={() => {
                    void confirmCancel();
                }}
                title={t('dialogs.cancel_title')}
                message={t('dialogs.cancel_message')}
                confirmLabel={t('common:actions.confirm')}
                variant="warning"
                isLoading={isCancelling}
                errorText={translateError(cancelErrorKey)}
            />
        </PageContainer>
    );
}
