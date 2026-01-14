import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Edit,
    Trash2,
    Star,
    AlertTriangle,
    History,
    Target,
    AlertCircle,
    XCircle
} from 'lucide-react';
import { riskApi } from '@/services/riskApi';
import { kriApi } from '@/services/kriApi';
import type { Risk, RiskControlLink, ControlEffectiveness } from '@/types/risk';
import type { KeyRiskIndicator, KRICreate, KRIUpdate, OverdueKRI } from '@/types/kri';
import type { HistoryTimelineItem } from '@/types/history';
import { PermissionGate } from '@/components/PermissionGate';
import { KRIModal } from '@/components/kri/KRIModal';
import { useRiskTypes } from '@/hooks/useRiskHubConfig';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RiskDetailOverviewTab } from '@/components/risks/RiskDetailOverviewTab';
import { RiskDetailKriHistoryTab } from '@/components/risks/RiskDetailKriHistoryTab';
import { useTranslation } from 'react-i18next';
import { isApprovalCreatedResponse } from '@/types/approval';
import { parseUpdateResult } from '@/lib/approvalUi';

type TabView = 'overview' | 'history';

export function RiskDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation('common');
    const { getColor, getDisplayName } = useRiskTypes();
    const [risk, setRisk] = useState<Risk | null>(null);
    const [linkedControls, setLinkedControls] = useState<RiskControlLink[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<'both' | 'search-only' | 'links-only'>('both');
    const [activeTab, setActiveTab] = useState<TabView>('overview');

    // Delete confirmation dialog state
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
    const [linkError, setLinkError] = useState<string | null>(null);

    // KRI Modal State
    const [isKRIModalOpen, setIsKRIModalOpen] = useState(false);
    const [selectedKRI, setSelectedKRI] = useState<KeyRiskIndicator | null>(null);

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
            const [riskData, controlsData, overdueData] = await Promise.all([
                riskApi.getRisk(riskId),
                riskApi.getLinkedControls(riskId),
                kriApi.getOverdue()
            ]);
            setRisk(riskData);
            setLinkedControls(controlsData);
            setOverdueKRIs(overdueData);
            setError(null);
        } catch (err) {
            console.error('Error fetching risk details:', err);
            setError('Failed to load risk details.');
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
                                { label: 'Recorded by', value: entry.recorded_by_name ?? 'System' },
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
    }, [activeTab, risk?.kris]);

    const handleDelete = async (reason?: string) => {
        if (!risk) return;
        try {
            setIsDeleting(true);
            const response = await riskApi.deleteRisk(risk.id, reason || 'Archived by user');

            // Check if the response indicates approval was required (202)
            if (isApprovalCreatedResponse(response)) {
                setApprovalMessage(
                    `Archive request submitted for approval (ID: ${response.approval_id}). The risk has not been archived yet.`
                );
                setIsDeleteDialogOpen(false);
                // Don't navigate away - show the approval message
                return;
            }

            // Immediate archive (204) - navigate away
            navigate('/risks');
        } catch (err) {
            console.error('Error deleting risk:', err);
            setApprovalMessage('Failed to archive risk. Please try again.');
        } finally {
            setIsDeleting(false);
            setIsDeleteDialogOpen(false);
        }
    };

    const handleLinkControl = async (controlId: number, effectiveness: ControlEffectiveness, notes?: string) => {
        if (!risk) return;
        setLinkError(null);
        try {
            await riskApi.linkControl(risk.id, { control_id: controlId, effectiveness, notes });
            const controlsData = await riskApi.getLinkedControls(risk.id);
            setLinkedControls(controlsData);
        } catch (err) {
            console.error('Linking failed:', err);
            setLinkError('Failed to link control. Please try again.');
        }
    };

    const handleUnlinkControl = async (controlId: number) => {
        if (!risk) return;
        setLinkError(null);
        try {
            await riskApi.unlinkControl(risk.id, controlId);
            const controlsData = await riskApi.getLinkedControls(risk.id);
            setLinkedControls(controlsData);
        } catch (err) {
            console.error('Unlinking failed:', err);
            setLinkError('Failed to unlink control. Please try again.');
        }
    };

    const handleSaveKRI = async (data: KRICreate | KRIUpdate) => {
        if (!risk) return;
        try {
            if (selectedKRI) {
                const result = await kriApi.updateKRI(selectedKRI.id, data as KRIUpdate);
                // Use standardized helper to check for 202 approval-queued response
                const parsed = parseUpdateResult(result);
                if (parsed.kind === 'approval') {
                    setApprovalMessage(
                        `KRI edit submitted for approval (ID: ${parsed.approvalId}). Changes will not be applied until approved.`
                    );
                    setIsKRIModalOpen(false);
                    return; // Don't refresh data - changes aren't applied yet
                }
            } else {
                await kriApi.createKRI(data as KRICreate);
            }
            await fetchData();
        } catch (err) {
            console.error('KRI Save failed:', err);
            setApprovalMessage('Failed to save KRI. Please try again.');
        }
    };

    const handleDeleteKRI = async (kriId: number) => {
        const reason = prompt('Why is this KRI being deleted?');
        if (!reason) return; // User cancelled or empty reason
        try {
            await kriApi.deleteKRI(kriId, reason);
            await fetchData();
        } catch (err) {
            console.error('KRI Delete failed:', err);
            alert('Failed to delete KRI.');
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5';
            case 'monitoring': return 'text-amber-400 border-amber-400/20 bg-amber-400/5';
            case 'closed': return 'text-slate-400 border-slate-400/20 bg-slate-400/5';
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

    if (error || !risk) {
        return (
            <div className="glass-card flex flex-col items-center justify-center p-20 text-center gap-4">
                <div className="bg-rose-500/20 p-4 rounded-full">
                    <AlertTriangle className="h-10 w-10 text-rose-500" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white uppercase tracking-tight">{t('access.risk_not_found')}</h3>
                    <p className="text-slate-500 mt-2 font-medium">{t('errors.not_found')}</p>
                </div>
                <button
                    onClick={() => navigate('/risks')}
                    className="mt-4 px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-all flex items-center gap-2"
                >
                    <ArrowLeft className="h-4 w-4" /> {t('navigation:tabs.risks', 'Risk Register')}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Approval/Error Message Banner */}
            {approvalMessage && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${approvalMessage.includes('Failed')
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    }`}>
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium">{approvalMessage}</p>
                        {!approvalMessage.includes('Failed') && (
                            <p className="text-xs mt-1 opacity-75">
                                View pending approvals in the <button onClick={() => navigate('/approvals')} className="underline hover:no-underline">Approvals</button> section.
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
            {linkError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {linkError}
                    <button onClick={() => setLinkError(null)} className="ml-auto opacity-50 hover:opacity-100">
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
                        <ArrowLeft className="h-3 w-3" /> Back to Register
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
                    <PermissionGate resource="risks" action="write">
                        <button
                            onClick={() => navigate(`/risks/${risk.id}/edit`)}
                            className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-accent/50 transition-all hover:shadow-[0_0_20px_rgba(30,132,255,0.1)]"
                        >
                            <Edit className="h-5 w-5" />
                        </button>
                    </PermissionGate>
                    <PermissionGate resource="risks" action="delete">
                        <button
                            onClick={() => setIsDeleteDialogOpen(true)}
                            className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-rose-400 hover:border-rose-400/50 transition-all"
                        >
                            <Trash2 className="h-5 w-5" />
                        </button>
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
                    <Target className="h-4 w-4 inline mr-2" />Overview
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'history'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <History className="h-4 w-4 inline mr-2" />KRI History
                </button>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <RiskDetailOverviewTab
                    risk={risk}
                    linkedControls={linkedControls}
                    overdueKRIs={overdueKRIs}
                    getColor={getColor}
                    getDisplayName={getDisplayName}
                    onOpenAddKri={() => {
                        setSelectedKRI(null);
                        setIsKRIModalOpen(true);
                    }}
                    onOpenKri={(kri) => {
                        setSelectedKRI(kri);
                        setIsKRIModalOpen(true);
                    }}
                    onLinkControl={handleLinkControl}
                    onUnlinkControl={handleUnlinkControl}
                    onOpenCreateControl={() => setIsCreateDialogOpen(true)}
                    onNavigateToControl={(controlId) => navigate(`/controls/${controlId}`)}
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

            {risk && (
                <KRIModal
                    risk_id={risk.id}
                    kri={selectedKRI}
                    isOpen={isKRIModalOpen}
                    onClose={() => setIsKRIModalOpen(false)}
                    onSave={handleSaveKRI}
                    onDelete={handleDeleteKRI}
                />
            )}

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={isDeleteDialogOpen}
                onClose={() => setIsDeleteDialogOpen(false)}
                onConfirm={handleDelete}
                title="Archive Risk"
                message={`"${risk?.name}"\n\nThis will move the risk to archived status.`}
                confirmLabel="Archive"
                variant="danger"
                isLoading={isDeleting}
                showInput
                inputLabel="Reason for archiving"
                inputPlaceholder="Why is this risk being archived?"
            />
        </div>
    );
}
