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
        questionnaires,
        loading,
        questionnairesLoading,
        filter,
        setFilter,
        selectedApproval,
        dialogMode,
        resolutionNotes,
        setResolutionNotes,
        isSubmitting,
        errorKey,
        cancelApprovalId,
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
    } = useApprovalsPageState();

    return (
        <div className="space-y-8 p-8">
            <div>
                <h1 className="text-4xl font-black text-white tracking-tighter mb-2">{t('title')}</h1>
                <p className="text-slate-500 font-medium">{t('page_subtitle')}</p>
            </div>

            {filter !== 'risk_assessment' && errorKey && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl flex items-center gap-2 mb-4">
                    <X className="h-5 w-5" />
                    <span>{errorKey.startsWith('errorKeys.') ? t(errorKey, { ns: 'errorKeys' }) : t(errorKey)}</span>
                    <button
                        onClick={refreshActiveView}
                        className="ml-auto text-sm underline hover:text-rose-300"
                    >
                        {t('common:actions.retry')}
                    </button>
                </div>
            )}

            <ApprovalsTabs filter={filter} onChange={setFilter} t={t} />

            {filter === 'risk_assessment' ? (
                <QuestionnaireInboxList
                    loading={questionnairesLoading}
                    questionnaires={questionnaires}
                    locale={i18n.language}
                    onOpenRisk={(riskId) => navigate(`/risks/${riskId}`)}
                    t={t}
                />
            ) : (
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

            <ApprovalResolutionDialog
                selectedApproval={selectedApproval}
                dialogMode={dialogMode}
                resolutionNotes={resolutionNotes}
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
            />
        </div>
    );
}
