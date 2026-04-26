import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Edit2, Trash2, Target, Plus, Clock, History, RotateCcw, FileText } from 'lucide-react';
import { KRIModal } from '@/components/kri/KRIModal';
import { KRIValueModal } from '@/components/kri/KRIValueModal';
import { KRIHistoryEditModal } from '@/components/kri/KRIHistoryEditModal';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { KRIDetailOverviewTab } from '@/components/kris/KRIDetailOverviewTab';
import { KRIDetailHistoryTab } from '@/components/kris/KRIDetailHistoryTab';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { getKriMonitoringMeta } from '@/lib/monitoringStatus';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { useTranslation } from '@/i18n/hooks';
import { formatMetricNumberValue } from '@/i18n/formatters';
import { useKriDetailState } from '@/pages/detail/useKriDetailState';

export function KRIDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation('common');
    const { t: tErrors } = useTranslation('errorKeys');
    const { t: tIssues } = useTranslation('issues');
    const {
        activeTab,
        approvalBanner,
        canRecordValue,
        canRequestHistoryCorrection,
        dueDate,
        handleDelete,
        handleRecordSuccess,
        handleRestore,
        handleSave,
        history,
        historyTotal,
        isDeleteDialogOpen,
        isDeleting,
        isEditModalOpen,
        isIssueModalOpen,
        isLoading,
        isLoadingHistory,
        isOverdue,
        isValueModalOpen,
        kri,
        linkedRisk,
        refreshHistory,
        selectedHistoryEntry,
        setActiveTab,
        setApprovalBanner,
        setIsDeleteDialogOpen,
        setIsEditModalOpen,
        setIsIssueModalOpen,
        setIsValueModalOpen,
        setSelectedHistoryEntry,
    } = useKriDetailState({ rawId: id });

    // formatNumber is still needed for overview tab
    const formatNumber = (val: number): string => {
        return formatMetricNumberValue(val, i18n.language);
    };

    if (isLoading) {
        return (
            <div className="p-8 animate-pulse">
                <div className="h-8 w-64 bg-white/5 rounded-lg mb-8" />
                <div className="h-64 bg-white/5 rounded-2xl" />
            </div>
        );
    }

    if (!kri) {
        return (
            <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
                <Target className="h-16 w-16 text-slate-700 mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">{t('access.kri_not_found')}</h2>
                <p className="text-sm text-slate-500 mb-6">{t('access.kri_not_found_desc')}</p>
                <Button onClick={() => navigate('/kris')} variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" /> {t('navigation:tabs.risk_appetite')}
                </Button>
            </div>
        );
    }

    const monitoring = getKriMonitoringMeta(kri.monitoring_status);
    const MonitoringIcon = monitoring.icon;
    const canUpdateKri = resolveCapabilityFlag(kri.capabilities, 'can_update');
    const canArchiveKri =
        resolveCapabilityFlag(kri.capabilities, 'can_archive_immediately') ||
        resolveCapabilityFlag(kri.capabilities, 'can_request_archive_approval');
    const canRestoreKri = resolveCapabilityFlag(kri.capabilities, 'can_restore');
    const canCreateIssue = resolveCapabilityFlag(kri.capabilities, 'can_create_issue');

    return (
        <div className="p-8">
            {/* Breadcrumb */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 text-sm text-slate-500 mb-6"
            >
                <button onClick={() => navigate('/kris')} className="hover:text-white transition-colors flex items-center gap-1">
                    <ArrowLeft className="h-4 w-4" /> {t('navigation:tabs.risk_appetite')}
                </button>
                <span>/</span>
                <span className="text-white font-medium truncate max-w-xs">{kri.metric_name}</span>
            </motion.div>

            {/* Header with Actions */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8"
            >
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="bg-accent/20 p-3 rounded-xl">
                            <Target className="h-6 w-6 text-accent" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-white leading-tight">{kri.metric_name}</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${monitoring.badgeClassName}`}>
                                    <MonitoringIcon className="h-3 w-3" />
                                    {t(monitoring.labelKey)}
                                </span>
                                {isOverdue && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                        <Clock className="h-3 w-3" /> {t('kris:overdue.days_overdue', { days: kri.days_overdue ?? 0 })}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    {kri.description && (
                        <p className="text-slate-400 text-sm font-medium mt-3 max-w-2xl leading-relaxed">{kri.description}</p>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {canCreateIssue && (
                        <Button
                            variant="outline"
                            onClick={() => setIsIssueModalOpen(true)}
                        >
                            <FileText className="h-4 w-4 mr-1" /> {tIssues('actions.new_issue')}
                        </Button>
                    )}
                    {canRecordValue && (
                        <Button onClick={() => setIsValueModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-500">
                            <Plus className="h-4 w-4 mr-1" /> {t('kris:value_modal.title')}
                        </Button>
                    )}
                    {canUpdateKri && (
                        <Button variant="outline" onClick={() => setIsEditModalOpen(true)}>
                            <Edit2 className="h-4 w-4 mr-1" /> {t('common:actions.edit')}
                        </Button>
                    )}
                    {kri.is_archived ? (
                        canRestoreKri && <Button variant="outline" onClick={handleRestore}>
                            <RotateCcw className="h-4 w-4 mr-1" /> {t('common:actions.unarchive')}
                        </Button>
                    ) : (
                        canArchiveKri && <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)} disabled={isDeleting}>
                            <Trash2 className="h-4 w-4 mr-1" /> {isDeleting ? t('common:actions.deleting') : t('common:actions.delete')}
                        </Button>
                    )}
                </div>
            </motion.div>

            {approvalBanner ? (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 flex items-start justify-between gap-4"
                >
                    <div>
                        <p className="font-semibold">
                            {tErrors('approval_submitted')}
                        </p>
                        <p className="mt-1 text-amber-200/80">
                            {approvalBanner.message}
                        </p>
                        <p className="mt-1 text-xs text-amber-200/60">
                            {t('kris:detail.approval_banner_help')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setApprovalBanner(null)}
                        className="text-xs font-semibold text-amber-200 hover:text-white transition-colors"
                    >
                        {t('actions.close')}
                    </button>
                </motion.div>
            ) : null}

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-white/10 mb-6">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'overview'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <Target className="h-4 w-4 inline mr-2" />{t('common:labels.overview')}
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'history'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <History className="h-4 w-4 inline mr-2" />{t('common:labels.history')} ({historyTotal})
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
                <KRIDetailOverviewTab
                    kri={kri}
                    linkedRisk={linkedRisk}
                    dueDate={dueDate}
                    formatNumber={formatNumber}
                    onNavigateToRisk={(riskId) => navigate(`/risks/${riskId}`)}
                />
            )}

            {activeTab === 'history' && (
                <KRIDetailHistoryTab
                    history={history}
                    historyTotal={historyTotal}
                    isLoadingHistory={isLoadingHistory}
                    lowerLimit={kri.lower_limit}
                    upperLimit={kri.upper_limit}
                    unit={kri.unit}
                    onSelectEntry={setSelectedHistoryEntry}
                    canRequestCorrection={canRequestHistoryCorrection}
                />
            )}

            {/* Edit Modal */}
            {
                kri && (
                    <KRIModal
                        risk_id={kri.risk_id}
                        kri={kri}
                        isOpen={isEditModalOpen}
                        onClose={() => setIsEditModalOpen(false)}
                        onSave={handleSave}
                    />
                )
            }

            {/* Record Value Modal */}
            {
                kri && (
                    <KRIValueModal
                        kri={kri}
                        isOpen={isValueModalOpen}
                        onClose={() => setIsValueModalOpen(false)}
                        onSuccess={handleRecordSuccess}
                    />
                )
            }

            {/* History Edit Modal */}
            {
                kri && selectedHistoryEntry && (
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
                    <IssueQuickCreateModal
                        isOpen={isIssueModalOpen}
                        onClose={() => setIsIssueModalOpen(false)}
                        contextEntityType="kri"
                        contextEntityId={kri.id}
                        contextEntityLabel={kri.metric_name}
                        onCreated={(issue) => navigate(`/issues/${issue.id}`)}
                    />

                    <ConfirmDialog
                        isOpen={isDeleteDialogOpen}
                        onClose={() => setIsDeleteDialogOpen(false)}
                        onConfirm={(inputValue) => handleDelete(inputValue)}
                        title={t('kris:delete_dialog.title')}
                        message={t('kris:delete_dialog.message')}
                        confirmLabel={t('kris:delete_dialog.confirm')}
                        variant="danger"
                        isLoading={isDeleting}
                        showInput
                        inputLabel={t('kris:delete_dialog.reason_label')}
                        inputPlaceholder={t('kris:delete_dialog.reason_placeholder')}
                        inputRequired
                    />
                </>
            )}
        </div >
    );
}

export default KRIDetailPage;
