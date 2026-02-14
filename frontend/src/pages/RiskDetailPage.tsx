import { useState, useEffect, useCallback } from 'react';
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
import { riskApi } from '@/services/riskApi';
import { kriApi } from '@/services/kriApi';
import { apiClient } from '@/services/apiClient';
import type { Risk, RiskControlLink, ControlEffectiveness } from '@/types/risk';
import type { OverdueKRI } from '@/types/kri';
import type { HistoryTimelineItem } from '@/types/history';
import type { Vendor } from '@/types/vendor';
import { PermissionGate } from '@/components/PermissionGate';
import { useRiskTypes } from '@/hooks/useRiskHubConfig';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RiskDetailOverviewTab } from '@/components/risks/RiskDetailOverviewTab';
import { RiskDetailKriHistoryTab } from '@/components/risks/RiskDetailKriHistoryTab';
import { RiskDetailQuestionnairesTab } from '@/components/risks/RiskDetailQuestionnairesTab';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { useTranslation } from '@/i18n/hooks';
import { isApprovalCreatedResponse } from '@/types/approval';

type TabView = 'overview' | 'history' | 'assessment';

export function RiskDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation('common');
    const { t: tIssues } = useTranslation('issues');
    const { getColor, getDisplayName } = useRiskTypes();
    const [risk, setRisk] = useState<Risk | null>(null);
    const [linkedControls, setLinkedControls] = useState<RiskControlLink[]>([]);
    const [linkedVendors, setLinkedVendors] = useState<Vendor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<'both' | 'search-only' | 'links-only'>('both');
    const [activeTab, setActiveTab] = useState<TabView>('overview');

    // Delete confirmation dialog state
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [approvalMessage, setApprovalMessage] = useState<{ key: string; isError: boolean; values?: Record<string, unknown> } | null>(null);
    const [linkErrorKey, setLinkErrorKey] = useState<string | null>(null);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

    // KRI History State
    const [kriHistoryItems, setKriHistoryItems] = useState<HistoryTimelineItem[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);

    // Overdue KRI State
    const [overdueKRIs, setOverdueKRIs] = useState<OverdueKRI[]>([]);

    const fetchData = useCallback(async () => {
        if (!id) return;
        try {
            setIsLoading(true);
            const riskId = parseInt(id);
            const [riskData, controlsData, vendorsData, overdueData] = await Promise.all([
                riskApi.getRisk(riskId),
                riskApi.getLinkedControls(riskId),
                riskApi.getLinkedVendors(riskId),
                kriApi.getOverdue()
            ]);
            setRisk(riskData);
            setLinkedControls(controlsData);
            setLinkedVendors(vendorsData);
            setOverdueKRIs(overdueData);
            setErrorKey(null);
        } catch (err) {
            console.error('Error fetching risk details:', err);
            setErrorKey(apiClient.toUiMessageKey(err));
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Fetch KRI history when History tab is active
    useEffect(() => {
        let cancelled = false;

        const fetchKriHistory = async () => {
            if (activeTab !== 'history' || !risk?.kris || risk.kris.length === 0) {
                setKriHistoryItems([]);
                return;
            }

            setIsHistoryLoading(true);
            try {
                const historyPromises = risk.kris.map(kri =>
                    kriApi.getHistory(kri.id, { size: 50 }).then(res => ({ kri, items: res.items }))
                );
                const results = await Promise.all(historyPromises);

                if (cancelled) return;

                // Flatten all history entries with KRI name
                const flatItems: HistoryTimelineItem[] = [];
                for (const { kri, items } of results) {
                    for (const entry of items) {
                        flatItems.push({
                            id: `${kri.id}-${entry.id}`,
                            title: `${kri.metric_name}: ${entry.value.toLocaleString()} ${entry.unit}`,
                            subtitle: `Period end ${new Date(entry.period_end).toLocaleDateString('cs-CZ')}`,
                            timestamp: entry.recorded_at,
                            status: entry.breach_status === 'within' ? 'success' : 'danger',
                            badge: entry.breach_status === 'within' ? 'OK' : 'BREACH',
                            meta: [
                                { label: 'KRI', value: kri.metric_name },
                                { label: t('risks:history.recorded_by'), value: entry.recorded_by_name ?? t('risks:history.system') },
                            ],
                        });
                    }
                }

                // Sort by recorded_at descending
                flatItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                setKriHistoryItems(flatItems);
            } catch (err) {
                console.error('Failed to fetch KRI history:', err);
            } finally {
                if (!cancelled) setIsHistoryLoading(false);
            }
        };

        fetchKriHistory();

        return () => {
            cancelled = true;
        };
    }, [activeTab, risk?.kris, t]);

    const handleDelete = async (reason?: string) => {
        if (!risk) return;
        try {
            setIsDeleting(true);
            const response = await riskApi.deleteRisk(risk.id, reason || 'Archived by user');

            // Check if the response indicates approval was required (202)
            if (isApprovalCreatedResponse(response)) {
                setApprovalMessage(
                    {
                        key: 'risks:messages.archive_submitted_for_approval',
                        isError: false,
                        values: { approvalId: response.approval_id },
                    }
                );
                setIsDeleteDialogOpen(false);
                // Don't navigate away - show the approval message
                return;
            }

            // Immediate archive (204) - navigate away
            navigate('/risks');
        } catch (err) {
            console.error('Error deleting risk:', err);
            setApprovalMessage({ key: apiClient.toUiMessageKey(err), isError: true });
        } finally {
            setIsDeleting(false);
            setIsDeleteDialogOpen(false);
        }
    };

    const handleRestore = async () => {
        if (!risk) return;
        try {
            await riskApi.restoreRisk(risk.id);
            await fetchData();
            setApprovalMessage({ key: 'risks:messages.restore_success', isError: false });
        } catch (err) {
            console.error('Error restoring risk:', err);
            setApprovalMessage({ key: apiClient.toUiMessageKey(err), isError: true });
        }
    };

    const handleLinkControl = async (controlId: number, effectiveness: ControlEffectiveness, notes?: string) => {
        if (!risk) return;
        setLinkErrorKey(null);
        try {
            await riskApi.linkControl(risk.id, { control_id: controlId, effectiveness, notes });
            const controlsData = await riskApi.getLinkedControls(risk.id);
            setLinkedControls(controlsData);
        } catch (err) {
            console.error('Linking failed:', err);
            setLinkErrorKey(apiClient.toUiMessageKey(err));
        }
    };

    const handleUnlinkControl = async (controlId: number) => {
        if (!risk) return;
        setLinkErrorKey(null);
        try {
            await riskApi.unlinkControl(risk.id, controlId);
            const controlsData = await riskApi.getLinkedControls(risk.id);
            setLinkedControls(controlsData);
        } catch (err) {
            console.error('Unlinking failed:', err);
            setLinkErrorKey(apiClient.toUiMessageKey(err));
        }
    };

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
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${approvalMessage.isError
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    }`}>
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium">
                            {approvalMessage.isError
                                ? t(approvalMessage.key, { ns: 'errorKeys' })
                                : t(approvalMessage.key, approvalMessage.values)}
                        </p>
                        {!approvalMessage.isError && (
                            <p className="text-xs mt-1 opacity-75">
                                {t('risks:messages.view_pending_approvals_prefix')}{' '}
                                <button onClick={() => navigate('/approvals')} className="underline hover:no-underline">
                                    {t('navigation:tabs.approvals')}
                                </button>{' '}
                                {t('risks:messages.view_pending_approvals_suffix')}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => setApprovalMessage(null)}
                        className="ml-auto text-current opacity-50 hover:opacity-100"
                    >
                        <XCircle className="h-4 w-4" />
                    </button>
                </div>
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
                    <PermissionGate resource="issues" action="write">
                        <button
                            onClick={() => setIsIssueModalOpen(true)}
                            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-white hover:border-accent/50 transition-all flex items-center gap-2"
                        >
                            <FileText className="h-4 w-4" />
                            {tIssues('actions.new_issue')}
                        </button>
                    </PermissionGate>
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
                    onRefreshData={fetchData}
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
                onConfirm={handleDelete}
                title={t('risks:confirmation.archive_title')}
                message={t('risks:confirmation.archive_message', { riskName: risk?.name })}
                confirmLabel={t('common:actions.archive')}
                variant="danger"
                isLoading={isDeleting}
                showInput
                inputLabel={t('common:labels.archive_reason')}
                inputPlaceholder={t('common:labels.archive_reason_placeholder')}
            />

            <IssueQuickCreateModal
                isOpen={isIssueModalOpen}
                onClose={() => setIsIssueModalOpen(false)}
                contextEntityType="risk"
                contextEntityId={risk.id}
                contextEntityLabel={risk.name}
                onCreated={(issue) => navigate(`/issues/${issue.id}`)}
            />
        </div>
    );
}
