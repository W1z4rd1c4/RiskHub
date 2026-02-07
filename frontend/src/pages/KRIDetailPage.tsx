import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Edit2, Trash2, Target, AlertTriangle, CheckCircle, Plus, Clock, History, RotateCcw } from 'lucide-react';
import { kriApi } from '@/services/kriApi';
import { riskApi } from '@/services/riskApi';
import { PermissionGate } from '@/components/PermissionGate';
import { usePermissions } from '@/hooks/usePermissions';
import { KRIModal } from '@/components/kri/KRIModal';
import { KRIValueModal } from '@/components/kri/KRIValueModal';
import { KRIHistoryEditModal } from '@/components/kri/KRIHistoryEditModal';
import { Button } from '@/components/ui/button';
import { KRIDetailOverviewTab } from '@/components/kris/KRIDetailOverviewTab';
import { KRIDetailHistoryTab } from '@/components/kris/KRIDetailHistoryTab';
import type { KeyRiskIndicator, KRIHistoryEntry } from '@/types/kri';
import type { Risk } from '@/types/risk';
import { useTranslation } from '@/i18n/hooks';

type TabView = 'overview' | 'history';

export function KRIDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation('common');
    const [kri, setKri] = useState<KeyRiskIndicator | null>(null);
    const [linkedRisk, setLinkedRisk] = useState<Risk | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isValueModalOpen, setIsValueModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [activeTab, setActiveTab] = useState<TabView>('overview');

    // History state
    const [history, setHistory] = useState<KRIHistoryEntry[]>([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<KRIHistoryEntry | null>(null);

    // Permissions
    const { canRecordKRI, user } = usePermissions();

    useEffect(() => {
        if (id) fetchKRI(parseInt(id));
    }, [id]);

    const fetchKRI = async (kriId: number) => {
        setIsLoading(true);
        try {
            const data = await kriApi.getKRI(kriId, { include_archived: true });
            setKri(data);
            // Fetch linked risk name
            if (data.risk_id) {
                try {
                    const risk = await riskApi.getRisk(data.risk_id);
                    setLinkedRisk(risk);
                } catch {
                    // Silently fail, card will show empty state
                }
            }
            // Fetch history
            fetchHistory(kriId);
        } catch (err) {
            console.error('Failed to fetch KRI:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchHistory = async (kriId: number) => {
        setIsLoadingHistory(true);
        try {
            const response = await kriApi.getHistory(kriId, { size: 50, include_archived: true });
            setHistory(response.items);
            setHistoryTotal(response.total);
        } catch (err) {
            console.error('Failed to fetch history:', err);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const handleDelete = async () => {
        if (!kri) return;
        const reason = prompt('Why is this KRI being deleted?');
        if (!reason) return; // User cancelled or empty reason
        setIsDeleting(true);
        try {
            await kriApi.deleteKRI(kri.id, reason);
            navigate('/kris');
        } catch (err) {
            console.error('Failed to delete KRI:', err);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRestore = async () => {
        if (!kri) return;
        try {
            await kriApi.restoreKRI(kri.id);
            await fetchKRI(kri.id);
        } catch (err) {
            console.error('Failed to restore KRI:', err);
        }
    };

    const handleSave = async (data: Partial<KeyRiskIndicator>) => {
        if (!kri) return;
        await kriApi.updateKRI(kri.id, data);
        await fetchKRI(kri.id);
    };

    const handleRecordSuccess = () => {
        if (kri) fetchKRI(kri.id);
    };

    // formatNumber is still needed for overview tab
    const formatNumber = (val: number): string => {
        if (val === 0) return '0';
        if (Math.abs(val) < 1) return val.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (Math.abs(val) < 100) return val.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
        return Math.round(val).toLocaleString('cs-CZ');
    };

    // Calculate due date (period_end + 15 days)
    const calculateDueDate = (): Date | null => {
        if (!kri?.last_period_end) return null;
        const periodEnd = new Date(kri.last_period_end);
        periodEnd.setDate(periodEnd.getDate() + 15);
        return periodEnd;
    };

    const dueDate = calculateDueDate();
    const isOverdue = dueDate && new Date() > dueDate;

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
                    <ArrowLeft className="h-4 w-4 mr-2" /> {t('navigation:tabs.risk_appetite', 'Risk Appetite')}
                </Button>
            </div>
        );
    }

    const isBreaching = kri.breach_status !== 'within';

    return (
        <div className="p-8">
            {/* Breadcrumb */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 text-sm text-slate-500 mb-6"
            >
                <button onClick={() => navigate('/kris')} className="hover:text-white transition-colors flex items-center gap-1">
                    <ArrowLeft className="h-4 w-4" /> Risk Appetite
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
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${isBreaching ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    }`}>
                                    {isBreaching ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                                    {isBreaching ? 'BREACH' : 'WITHIN LIMITS'}
                                </span>
                                {isOverdue && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                        <Clock className="h-3 w-3" /> OVERDUE
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
                    {(canRecordKRI || (!!kri && !!user?.id && kri.reporting_owner_id === user.id)) && (
                        <Button onClick={() => setIsValueModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-500">
                            <Plus className="h-4 w-4 mr-1" /> Record Value
                        </Button>
                    )}
                    <PermissionGate resource="risks" action="write">
                        <Button variant="outline" onClick={() => setIsEditModalOpen(true)}>
                            <Edit2 className="h-4 w-4 mr-1" /> Edit
                        </Button>
                    </PermissionGate>
                    <PermissionGate resource="risks" action="delete">
                        {kri.is_archived ? (
                            <Button variant="outline" onClick={handleRestore}>
                                <RotateCcw className="h-4 w-4 mr-1" /> Unarchive
                            </Button>
                        ) : (
                            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                                <Trash2 className="h-4 w-4 mr-1" /> {isDeleting ? 'Deleting...' : 'Delete'}
                            </Button>
                        )}
                    </PermissionGate>
                </div>
            </motion.div>

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-white/10 mb-6">
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
                    <History className="h-4 w-4 inline mr-2" />History ({historyTotal})
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
                <KRIDetailOverviewTab
                    kri={kri}
                    linkedRisk={linkedRisk}
                    isBreaching={isBreaching}
                    dueDate={dueDate}
                    isOverdue={!!isOverdue}
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
                        onDelete={handleDelete}
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
                        onSuccess={() => fetchHistory(kri.id)}
                    />
                )
            }
        </div >
    );
}
