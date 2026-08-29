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
import { useRiskTypes } from '@/hooks/useRiskHubConfig';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { canArchive, resolveCapabilityFlag } from '@/lib/capabilities';
import { RiskDetailOverviewTab } from '@/components/risks/RiskDetailOverviewTab';
import { RiskDetailKriHistoryTab } from '@/components/risks/RiskDetailKriHistoryTab';
import { RiskDetailQuestionnairesTab } from '@/components/risks/RiskDetailQuestionnairesTab';
import { useTranslation } from '@/i18n/hooks';
import { DetailActionBanner } from '@/pages/detail/DetailActionBanner';
import { ContextualIssueAction } from '@/pages/detail/ContextualIssueAction';
import { EntityDetailHeader } from '@/pages/detail/EntityDetailHeader';
import { useRiskDetailState } from '@/pages/detail/useRiskDetailState';
import { ReadAccessDeniedState } from '@/pages/shared/ReadAccessDeniedState';
import { getRiskDisplayStatus } from '@/pages/risks/risksPagePresentation';

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
        isAccessDenied,
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
            case 'active': return 'text-success-text border-success/20 bg-success/10';
            case 'emerging': return 'text-warning-text border-warning/20 bg-warning/10';
            default: return 'text-muted-foreground border-border bg-muted';
        }
    };


    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4" aria-busy="true" data-loading="true">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">{t('loading.risk_data')}</p>
            </div>
        );
    }

    if (isAccessDenied) {
        return <ReadAccessDeniedState />;
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
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate('/risks')}
                    className="mt-4 font-bold"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('navigation:tabs.risks')}
                </Button>
            </div>
        );
    }

    const canUpdateRisk = resolveCapabilityFlag(risk.capabilities, 'can_update');
    const canArchiveRisk = canArchive(risk.capabilities);
    const canRestoreRisk = resolveCapabilityFlag(risk.capabilities, 'can_restore');
    const canCreateIssue = resolveCapabilityFlag(risk.capabilities, 'can_create_issue');
    const displayStatus = getRiskDisplayStatus(risk);

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
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    {t(linkErrorKey, { ns: 'errorKeys' })}
                    <Button
                        type="button"
                        variant="secondary"
                        size="iconCompact"
                        onClick={() => setLinkErrorKey(null)}
                        aria-label={t('actions.close')}
                        className="ml-auto opacity-50 hover:opacity-100"
                    >
                        <XCircle className="h-3 w-3" aria-hidden="true" />
                    </Button>
                </div>
            )}

            <EntityDetailHeader
                backAction={(
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => navigate('/risks')}
                        className="text-xs font-black uppercase tracking-widest"
                    >
                        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> {t('risks:actions.back_to_register')}
                    </Button>
                )}
                identifier={risk.risk_id_code}
                identifierSeparatorLabel={t('detail_header.identifier_separator')}
                title={risk.name}
                titleAdornment={risk.is_priority ? <Star className="h-5 w-5 text-amber-400 fill-amber-400" /> : undefined}
                statuses={(
                    <>
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border ${getStatusColor(displayStatus)}`}>
                            {displayStatus}
                        </span>
                    </>
                )}
                metadata={<span>{risk.process}</span>}
                description={risk.description}
                actions={(
                    <>
                    <ContextualIssueAction
                        buttonLabel={tIssues('actions.new_issue')}
                        canCreateIssue={canCreateIssue}
                        contextEntityId={risk.id}
                        contextEntityLabel={risk.name}
                        contextEntityType="risk"
                        isOpen={isIssueModalOpen}
                        onClose={() => setIsIssueModalOpen(false)}
                        onCreated={(issue) => navigate(`/issues/${issue.id}`)}
                        onOpen={() => setIsIssueModalOpen(true)}
                    />
                    {canUpdateRisk && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={() => navigate(`/risks/${risk.id}/edit`)}
                            title={t('risks:edit_risk')}
                            aria-label={t('risks:edit_risk')}
                        >
                            <Edit className="h-5 w-5" aria-hidden="true" />
                        </Button>
                    )}
                    {risk.is_archived ? (
                        canRestoreRisk && (
                            <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                onClick={handleRestore}
                                title={t('risks:tooltips.unarchive_risk')}
                                aria-label={t('risks:tooltips.unarchive_risk')}
                            >
                                <RotateCcw className="h-5 w-5" aria-hidden="true" />
                            </Button>
                        )
                    ) : (
                        canArchiveRisk && (
                            <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                onClick={() => setIsDeleteDialogOpen(true)}
                                title={t('actions.archive')}
                                aria-label={t('actions.archive')}
                            >
                                <Trash2 className="h-5 w-5" aria-hidden="true" />
                            </Button>
                        )
                    )}
                    </>
                )}
            />

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-white/10">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-6 py-3 font-bold transition-colors ${activeTab === 'overview'
                        ? 'text-accent-text border-b-2 border-accent'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    <Target className="h-4 w-4 inline mr-2" />
                    {t('risks:tabs.overview')}
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-6 py-3 font-bold transition-colors ${activeTab === 'history'
                        ? 'text-accent-text border-b-2 border-accent'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    <History className="h-4 w-4 inline mr-2" />
                    {t('risks:tabs.history')}
                </button>
                <button
                    onClick={() => setActiveTab('assessment')}
                    className={`px-6 py-3 font-bold transition-colors ${activeTab === 'assessment'
                        ? 'text-accent-text border-b-2 border-accent'
                        : 'text-muted-foreground hover:text-foreground'
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
