import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { X } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ApprovalList } from './approvals/ApprovalList';
import { ApprovalResolutionDialog } from './approvals/ApprovalResolutionDialog';
import { ApprovalsTabs } from './approvals/ApprovalsTabs';
import { QuestionnaireInboxList } from './approvals/QuestionnaireInboxList';
import { useApprovalsPageState } from './approvals/useApprovalsPageState';

export default function ApprovalsPage() {
    const { t, i18n } = useTranslation('approvals');
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
        <div className="space-y-8 p-8">
            <div>
                <h1 className="text-4xl font-black text-foreground tracking-tighter mb-2">{t('title')}</h1>
                <p className="text-muted-foreground font-medium">{t('page_subtitle')}</p>
            </div>

            {filter !== 'risk_assessment' && approvalQueueErrorKey && (
                <div role="alert" className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl flex items-center gap-2 mb-4">
                    <X className="h-5 w-5" />
                    <span>{translateError(approvalQueueErrorKey)}</span>
                    <button
                        type="button"
                        onClick={refreshActiveView}
                        className="ml-auto text-sm underline hover:text-rose-300"
                    >
                        {t('common:actions.retry')}
                    </button>
                </div>
            )}

            <ApprovalsTabs filter={filter} onChange={setFilter} t={t} label={t('title')}>
                {filter === 'risk_assessment' ? (
                    <QuestionnaireInboxList
                        questionnaires={questionnaires}
                        outcome={questionnairesOutcome}
                        locale={i18n.language}
                        onOpenRisk={(riskId) => navigate(`/risks/${riskId}`)}
                        onRetry={() => void retryQuestionnaires()}
                        t={t}
                    />
                ) : (
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="approval-search" className="sr-only">
                                {t('workbench.search_label')}
                            </label>
                            <input
                                id="approval-search"
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={t('workbench.search_placeholder')}
                                className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                            />
                        </div>

                        {(loading || approvalPageAvailable) && (
                            <ApprovalList
                                approvals={approvals}
                                loading={loading}
                                expandedRows={expandedRows}
                                locale={i18n.language}
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
                            <nav
                                aria-label={t('workbench.pagination_label')}
                                className="flex items-center justify-between gap-4"
                            >
                                <p
                                    role={loading ? 'status' : undefined}
                                    className="text-sm text-muted-foreground"
                                >
                                    {rangeText}
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!loading && approvalSkip > 0) {
                                                setPage(page - 1);
                                            }
                                        }}
                                        disabled={!loading && approvalSkip === 0}
                                        aria-disabled={loading || approvalSkip === 0}
                                        className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                                    >
                                        {t('workbench.previous_page')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!loading && approvalSkip + approvalLimit < approvalTotal) {
                                                setPage(page + 1);
                                            }
                                        }}
                                        disabled={!loading && approvalSkip + approvalLimit >= approvalTotal}
                                        aria-disabled={loading || approvalSkip + approvalLimit >= approvalTotal}
                                        className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                                    >
                                        {t('workbench.next_page')}
                                    </button>
                                </div>
                            </nav>
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
                            locale={i18n.language}
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
        </div>
    );
}
