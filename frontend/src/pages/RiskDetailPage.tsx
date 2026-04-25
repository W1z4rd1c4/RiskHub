import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Edit,
    Trash2,
    Star,
    AlertTriangle,
    History,
    FileText,
    Target,
    AlertCircle,
    XCircle,
    RotateCcw
} from 'lucide-react';
import { PermissionGate } from '@/components/PermissionGate';
import { useRiskTypes } from '@/hooks/useRiskHubConfig';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RiskDetailOverviewTab } from '@/components/risks/RiskDetailOverviewTab';
import { RiskDetailKriHistoryTab } from '@/components/risks/RiskDetailKriHistoryTab';
import { RiskDetailQuestionnairesTab } from '@/components/risks/RiskDetailQuestionnairesTab';
import { useTranslation } from '@/i18n/hooks';
import { DetailActionBanner } from '@/pages/detail/DetailActionBanner';
import { ContextualIssueAction } from '@/pages/detail/ContextualIssueAction';
import { useRiskDetailState } from '@/pages/detail/useRiskDetailState';

export function RiskDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation('common');
    const { t: tIssues } = useTranslation('issues');
    const { getColor, getDisplayName } = useRiskTypes();
    const {
        activeTab,
        approvalMessage,
        dialogMode,
        errorKey,
        handleArchive,
        handleLinkControl,
        handleRestore,
        handleUnlinkControl,
        isCreateDialogOpen,
        isDeleteDialogOpen,
        isDeleting,
        isHistoryLoading,
        isIssueModalOpen,
        isLinkDialogOpen,
        isLoading,
        kriHistoryItems,
        linkErrorKey,
        linkedControls,
        linkedVendors,
        overdueKRIs,
        refreshData,
        risk,
        setActiveTab,
        setApprovalMessage,
        setDialogMode,
        setIsCreateDialogOpen,
        setIsDeleteDialogOpen,
        setIsIssueModalOpen,
        setIsLinkDialogOpen,
        setLinkErrorKey,
    } = useRiskDetailState({ rawId: id });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5';
            case 'emerging': return 'text-amber-400 border-amber-400/20 bg-amber-400/5';
            case 'archived': return 'text-rose-400 border-rose-400/20 bg-rose-400/5';
            default: return 'text-slate-400 border-slate-400/20 bg-slate-400/5';
        }
    };


    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">{t('loading.risk_data')}</p>
            </div>
        );
    }

    if (errorKey || !risk) {
        return (
            <div className="glass-card flex flex-col items-center justify-center p-20 text-center gap-4">
                <div className="bg-rose-500/20 p-4 rounded-full">
                    <AlertTriangle className="h-10 w-10 text-rose-500" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white uppercase tracking-tight">{t('access.risk_not_found')}</h3>
                    <p className="text-slate-500 mt-2 font-medium">
                        {errorKey ? t(errorKey, { ns: 'errorKeys' }) : t('errors.not_found')}
                    </p>
                </div>
                <button
                    onClick={() => navigate('/risks')}
                    className="mt-4 px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-all flex items-center gap-2"
                >
                    <ArrowLeft className="h-4 w-4" /> {t('navigation:tabs.risks')}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Approval/Error Message Banner */}
            {approvalMessage && (
                <DetailActionBanner
                    approvalsLabel={t('navigation:tabs.approvals')}
                    message={approvalMessage}
                    messageText={approvalMessage.isError ? t(approvalMessage.key, { ns: 'errorKeys' }) : t(approvalMessage.key)}
                    onClose={() => setApprovalMessage(null)}
                    onNavigateApprovals={() => navigate('/approvals')}
                    pendingText={t('risks:messages.view_pending_approvals_prefix')}
                    sectionSuffix={t('risks:messages.view_pending_approvals_suffix')}
                />
            )}

            {/* Link Error Message */}
            {linkErrorKey && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {t(linkErrorKey, { ns: 'errorKeys' })}
                    <button onClick={() => setLinkErrorKey(null)} className="ml-auto opacity-50 hover:opacity-100">
                        <XCircle className="h-3 w-3" />
                    </button>
                </div>
            )}

            {/* Header / Breadcrumb */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="space-y-2">
                    <button
                        onClick={() => navigate('/risks')}
                        className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-accent transition-colors uppercase tracking-widest mb-4"
                    >
                        <ArrowLeft className="h-3 w-3" /> {t('risks:actions.back_to_register')}
                    </button>
                    <div className="flex items-center gap-4">
                        <h2 className="text-4xl font-black text-white tracking-tighter">{risk.name}</h2>
                        {risk.is_priority && (
                            <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
                        )}
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getStatusColor(risk.status)}`}>
                            {risk.status}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
                        <span>{risk.process}</span>
                    </div>
                    <p className="text-slate-500 font-medium max-w-2xl">{risk.description}</p>
                </div>

                <div className="flex items-center gap-3">
                    <ContextualIssueAction
                        buttonLabel={tIssues('actions.new_issue')}
                        contextEntityId={risk.id}
                        contextEntityLabel={risk.name}
                        contextEntityType="risk"
                        isOpen={isIssueModalOpen}
                        onClose={() => setIsIssueModalOpen(false)}
                        onCreated={(issue) => navigate(`/issues/${issue.id}`)}
                        onOpen={() => setIsIssueModalOpen(true)}
                    />
                    <PermissionGate resource="risks" action="write">
                        <button
                            onClick={() => navigate(`/risks/${risk.id}/edit`)}
                            className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-accent/50 transition-all hover:shadow-lg hover:shadow-accent/20"
                        >
                            <Edit className="h-5 w-5" />
                        </button>
                    </PermissionGate>
                    <PermissionGate resource="risks" action="delete">
                        {risk.status === 'archived' ? (
                            <button
                                onClick={handleRestore}
                                className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-emerald-400 hover:border-emerald-400/50 transition-all"
                                title={t('risks:tooltips.unarchive_risk')}
                            >
                                <RotateCcw className="h-5 w-5" />
                            </button>
                        ) : (
                            <button
                                onClick={() => setIsDeleteDialogOpen(true)}
                                className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-rose-400 hover:border-rose-400/50 transition-all"
                            >
                                <Trash2 className="h-5 w-5" />
                            </button>
                        )}
                    </PermissionGate>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-white/10">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'overview'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <Target className="h-4 w-4 inline mr-2" />
                    {t('risks:tabs.overview')}
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'history'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <History className="h-4 w-4 inline mr-2" />
                    {t('risks:tabs.history')}
                </button>
                <button
                    onClick={() => setActiveTab('assessment')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'assessment'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <FileText className="h-4 w-4 inline mr-2" />
                    {t('risks:tabs.assessment')}
                </button>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <RiskDetailOverviewTab
                    risk={risk}
                    linkedControls={linkedControls}
                    linkedVendors={linkedVendors}
                    overdueKRIs={overdueKRIs}
                    getColor={getColor}
                    getDisplayName={getDisplayName}
                    onNavigateToNewKri={() => navigate(`/kris/new?risk_id=${risk.id}`)}
                    onNavigateToKri={(kriId) => navigate(`/kris/${kriId}`)}
                    onLinkControl={handleLinkControl}
                    onUnlinkControl={handleUnlinkControl}
                    onOpenCreateControl={() => setIsCreateDialogOpen(true)}
                    onNavigateToControl={(controlId) => navigate(`/controls/${controlId}`)}
                    onNavigateToVendor={(vendorId) => navigate(`/vendors/${vendorId}`)}
                    onRefreshData={refreshData}
                    isLinkDialogOpen={isLinkDialogOpen}
                    setIsLinkDialogOpen={setIsLinkDialogOpen}
                    dialogMode={dialogMode}
                    setDialogMode={setDialogMode}
                    isCreateDialogOpen={isCreateDialogOpen}
                    setIsCreateDialogOpen={setIsCreateDialogOpen}
                />
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
                <RiskDetailKriHistoryTab
                    items={kriHistoryItems}
                    loading={isHistoryLoading}
                    hasKRIs={!!(risk.kris && risk.kris.length > 0)}
                />
            )}

            {/* Risk Assessment Tab */}
            {activeTab === 'assessment' && (
                <RiskDetailQuestionnairesTab risk={risk} />
            )}

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={isDeleteDialogOpen}
                onClose={() => setIsDeleteDialogOpen(false)}
                onConfirm={handleArchive}
                title={t('risks:confirmation.archive_title')}
                message={t('risks:confirmation.archive_message', { riskName: risk?.name })}
                confirmLabel={t('common:actions.archive')}
                variant="danger"
                isLoading={isDeleting}
                showInput
                inputLabel={t('common:labels.archive_reason')}
                inputPlaceholder={t('common:labels.archive_reason_placeholder')}
            />

        </div>
    );
}

export default RiskDetailPage;
