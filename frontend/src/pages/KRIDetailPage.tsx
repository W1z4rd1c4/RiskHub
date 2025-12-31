import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Edit2, Trash2, Target, AlertTriangle, CheckCircle, ExternalLink, Plus, Calendar, User, Clock, History, TrendingUp } from 'lucide-react';
import { kriApi } from '@/services/kriApi';
import { riskApi } from '@/services/riskApi';
import { PermissionGate } from '@/components/PermissionGate';
import { KRIModal } from '@/components/kri/KRIModal';
import { KRIValueModal } from '@/components/kri/KRIValueModal';
import { Button } from '@/components/ui/button';
import { HistoryTimeline, HistoryTrendChart, HistoryComparisonPanel } from '@/components/history';
import type { KeyRiskIndicator, KRIHistoryEntry } from '@/types/kri';
import type { HistoryTimelineItem, HistoryTrendPoint } from '@/types/history';

type TabView = 'overview' | 'history';

export function KRIDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [kri, setKri] = useState<KeyRiskIndicator | null>(null);
    const [riskName, setRiskName] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isValueModalOpen, setIsValueModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [activeTab, setActiveTab] = useState<TabView>('overview');

    // History state
    const [history, setHistory] = useState<KRIHistoryEntry[]>([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    useEffect(() => {
        if (id) fetchKRI(parseInt(id));
    }, [id]);

    const fetchKRI = async (kriId: number) => {
        setIsLoading(true);
        try {
            const data = await kriApi.getKRI(kriId);
            setKri(data);
            // Fetch linked risk name
            if (data.risk_id) {
                try {
                    const risk = await riskApi.getRisk(data.risk_id);
                    setRiskName(risk.description?.substring(0, 80) || risk.risk_id_code || 'Unknown');
                } catch {
                    setRiskName(`Risk #${data.risk_id}`);
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
            const response = await kriApi.getHistory(kriId, { size: 50 });
            setHistory(response.items);
            setHistoryTotal(response.total);
        } catch (err) {
            console.error('Failed to fetch history:', err);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const handleDelete = async () => {
        if (!kri || !confirm('Are you sure you want to delete this KRI?')) return;
        setIsDeleting(true);
        try {
            await kriApi.deleteKRI(kri.id);
            navigate('/kris');
        } catch (err) {
            console.error('Failed to delete KRI:', err);
        } finally {
            setIsDeleting(false);
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

    const formatNumber = (val: number): string => {
        if (val === 0) return '0';
        if (Math.abs(val) < 1) return val.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (Math.abs(val) < 100) return val.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
        return Math.round(val).toLocaleString('cs-CZ');
    };

    const formatDate = (dateStr: string): string => {
        return new Date(dateStr).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // Build chart data - sorted by period_end ascending
    const historyChartData = useMemo<HistoryTrendPoint[]>(() => {
        if (!history.length) return [];
        const sorted = [...history].sort((a, b) => new Date(a.period_end).getTime() - new Date(b.period_end).getTime());
        return sorted.map(entry => ({
            label: formatDate(entry.period_end),
            value: entry.value,
            status: entry.breach_status === 'within' ? 'within' : 'above',
        }));
    }, [history]);

    // Build timeline items - sorted by recorded_at descending
    const timelineItems = useMemo<HistoryTimelineItem[]>(() => {
        if (!history.length || !kri) return [];
        const sorted = [...history].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
        return sorted.map(entry => ({
            id: entry.id,
            title: `${formatNumber(entry.value)} ${entry.unit}`,
            subtitle: `Period end ${formatDate(entry.period_end)}`,
            timestamp: entry.recorded_at,
            status: entry.breach_status === 'within' ? 'success' : 'danger',
            meta: [
                { label: 'Recorded by', value: entry.recorded_by_name ?? 'System' },
                { label: 'Period', value: `${formatDate(entry.period_start)} – ${formatDate(entry.period_end)}` },
            ],
        }));
    }, [history, kri]);

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
                <h2 className="text-xl font-bold text-white mb-2">KRI Not Found</h2>
                <p className="text-sm text-slate-500 mb-6">The requested Key Risk Indicator does not exist.</p>
                <Button onClick={() => navigate('/kris')} variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back to Risk Appetite
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
                </div>

                <PermissionGate resource="risks" action="write">
                    <div className="flex items-center gap-2">
                        <Button onClick={() => setIsValueModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-500">
                            <Plus className="h-4 w-4 mr-1" /> Record Value
                        </Button>
                        <Button variant="outline" onClick={() => setIsEditModalOpen(true)}>
                            <Edit2 className="h-4 w-4 mr-1" /> Edit
                        </Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                            <Trash2 className="h-4 w-4 mr-1" /> {isDeleting ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </PermissionGate>
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
                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Current Value Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="glass-card lg:col-span-2"
                    >
                        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Target className="h-4 w-4 text-accent" /> Current Value
                        </h3>
                        <div className="text-center py-8">
                            <div className={`text-5xl font-black mb-2 ${isBreaching ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {formatNumber(kri.current_value)}
                                <span className="text-lg text-slate-400 ml-2 font-bold">{kri.unit}</span>
                            </div>
                            <div className="text-sm text-slate-500">
                                Limits: <span className="text-white font-bold">{formatNumber(kri.lower_limit)}</span> – <span className="text-white font-bold">{formatNumber(kri.upper_limit)}</span> {kri.unit}
                            </div>
                        </div>

                        {/* Visual Gauge */}
                        <div className="relative h-4 bg-white/5 rounded-full overflow-hidden mt-6">
                            <div
                                className="absolute h-full bg-emerald-500/20"
                                style={{
                                    left: `${Math.max(0, (kri.lower_limit / kri.upper_limit) * 50)}%`,
                                    width: `${Math.min(100, ((kri.upper_limit - kri.lower_limit) / kri.upper_limit) * 100)}%`
                                }}
                            />
                            <motion.div
                                initial={{ left: 0 }}
                                animate={{ left: `${Math.min(100, Math.max(0, (kri.current_value / kri.upper_limit) * 80))}%` }}
                                className={`absolute w-4 h-4 rounded-full -top-0 ${isBreaching ? 'bg-rose-500' : 'bg-emerald-500'}`}
                            />
                        </div>
                    </motion.div>

                    {/* Reporting Info Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="glass-card"
                    >
                        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-accent" /> Reporting
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between py-2 border-b border-white/5">
                                <span className="text-xs text-slate-500">Frequency</span>
                                <span className="text-sm font-bold text-white capitalize">{kri.frequency || 'Quarterly'}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-white/5">
                                <span className="text-xs text-slate-500 flex items-center gap-1"><User className="h-3 w-3" /> Owner</span>
                                <span className="text-sm font-bold text-white">{kri.reporting_owner_name || '(Risk Owner)'}</span>
                            </div>
                            {kri.last_period_end && (
                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                    <span className="text-xs text-slate-500">Last Period End</span>
                                    <span className="text-sm font-bold text-white">{new Date(kri.last_period_end).toLocaleDateString()}</span>
                                </div>
                            )}
                            {dueDate && (
                                <div className="flex items-center justify-between py-2">
                                    <span className="text-xs text-slate-500">Due Date</span>
                                    <span className={`text-sm font-bold ${isOverdue ? 'text-amber-400' : 'text-white'}`}>
                                        {dueDate.toLocaleDateString()}
                                    </span>
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Linked Risk Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="glass-card"
                    >
                        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4">Linked Risk</h3>
                        <div
                            onClick={() => navigate(`/risks/${kri.risk_id}`)}
                            className="p-4 bg-white/5 rounded-xl border border-white/10 hover:border-accent/30 hover:bg-white/10 cursor-pointer group transition-all"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-white group-hover:text-accent transition-colors line-clamp-2">{riskName}</span>
                                <ExternalLink className="h-4 w-4 text-slate-600 group-hover:text-accent transition-colors" />
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2">Click to view risk details</p>
                        </div>
                    </motion.div>

                    {/* Metadata */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="glass-card lg:col-span-3"
                    >
                        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4">Metadata</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest">KRI ID</span>
                                <p className="text-sm font-bold text-white">{kri.id}</p>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Unit</span>
                                <p className="text-sm font-bold text-white">{kri.unit || '—'}</p>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Last Updated</span>
                                <p className="text-sm font-bold text-white">{kri.last_updated ? new Date(kri.last_updated).toLocaleDateString('cs-CZ') : '—'}</p>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Status</span>
                                <p className="text-sm font-bold text-white">{kri.breach_status === 'within' ? 'OK' : 'BREACH'}</p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {activeTab === 'history' && (
                <div className="space-y-6">
                    {/* Trend Chart */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-card"
                    >
                        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-accent" /> Value Trend
                        </h3>
                        <HistoryTrendChart
                            data={historyChartData}
                            lowerLimit={kri.lower_limit}
                            upperLimit={kri.upper_limit}
                            valueLabel={kri.unit || 'Value'}
                            formatValue={formatNumber}
                            emptyMessage="No history recorded yet. Click 'Record Value' to start tracking."
                        />
                    </motion.div>

                    {/* Timeline */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="glass-card"
                    >
                        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                            <History className="h-4 w-4 text-accent" /> Record Timeline
                            {historyTotal > 0 && <span className="text-slate-500 font-normal">({historyTotal} entries)</span>}
                        </h3>
                        <HistoryTimeline
                            items={timelineItems}
                            loading={isLoadingHistory}
                            emptyMessage="No history recorded yet. Click 'Record Value' to start tracking."
                        />
                    </motion.div>

                    {/* Compare Periods */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="glass-card"
                    >
                        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-accent" /> Compare Periods
                        </h3>
                        {history.length >= 2 ? (
                            <HistoryComparisonPanel
                                entries={history}
                                formatValue={formatNumber}
                            />
                        ) : (
                            <div className="text-center py-8 text-slate-500 text-sm">
                                Need at least 2 history entries to compare periods.
                            </div>
                        )}
                    </motion.div>
                </div>
            )}

            {/* Edit Modal */}
            {kri && (
                <KRIModal
                    risk_id={kri.risk_id}
                    kri={kri}
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    onSave={handleSave}
                    onDelete={handleDelete}
                />
            )}

            {/* Record Value Modal */}
            {kri && (
                <KRIValueModal
                    kri={kri}
                    isOpen={isValueModalOpen}
                    onClose={() => setIsValueModalOpen(false)}
                    onSuccess={handleRecordSuccess}
                />
            )}
        </div>
    );
}
