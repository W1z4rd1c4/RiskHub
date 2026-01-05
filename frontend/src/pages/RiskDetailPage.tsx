import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    ArrowLeft,
    Edit,
    Trash2,
    Building2,
    User,
    Tag,
    ShieldAlert,
    Star,
    Clock,
    AlertTriangle,
    CheckCircle2,
    FileText,
    Plus,
    Link as LinkIcon,
    History,
    Target
} from 'lucide-react';
import { riskApi } from '@/services/riskApi';
import { kriApi } from '@/services/kriApi';
import type { Risk, RiskControlLink, ControlEffectiveness } from '@/types/risk';
import type { KeyRiskIndicator, KRICreate, KRIUpdate, OverdueKRI } from '@/types/kri';
import type { HistoryTimelineItem } from '@/types/history';
import { PermissionGate } from '@/components/PermissionGate';
import { RiskScoreMatrix } from '@/components/RiskScoreMatrix';
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import { ControlCreateDialog } from '@/components/ControlCreateDialog';
import { KRIGaugeCard } from '@/components/kri/KRIGaugeCard';
import { KRIModal } from '@/components/kri/KRIModal';
import { ControlGaugeCard } from '@/components/controls/ControlGaugeCard';
import { HistoryTimeline } from '@/components/history';
import { useRiskTypes } from '@/hooks/useRiskHubConfig';

// Helper to convert hex color to rgba for backgrounds/borders
function hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(100, 116, 139, ${alpha})`; // slate-500 fallback
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type TabView = 'overview' | 'history';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

export function RiskDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { getColor, getDisplayName } = useRiskTypes();
    const [risk, setRisk] = useState<Risk | null>(null);
    const [linkedControls, setLinkedControls] = useState<RiskControlLink[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<'both' | 'search-only' | 'links-only'>('both');
    const [activeTab, setActiveTab] = useState<TabView>('overview');

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

    const handleDelete = async () => {
        if (!risk || !window.confirm('Are you sure you want to archive this risk?')) return;
        try {
            await riskApi.deleteRisk(risk.id);
            navigate('/risks');
        } catch (err) {
            console.error('Error deleting risk:', err);
            alert('Failed to archive risk.');
        }
    };

    const handleLinkControl = async (controlId: number, effectiveness: ControlEffectiveness, notes?: string) => {
        if (!risk) return;
        try {
            await riskApi.linkControl(risk.id, { control_id: controlId, effectiveness, notes });
            const controlsData = await riskApi.getLinkedControls(risk.id);
            setLinkedControls(controlsData);
        } catch (err) {
            console.error('Linking failed:', err);
            alert('Failed to link control.');
        }
    };

    const handleUnlinkControl = async (controlId: number) => {
        if (!risk) return;
        try {
            await riskApi.unlinkControl(risk.id, controlId);
            const controlsData = await riskApi.getLinkedControls(risk.id);
            setLinkedControls(controlsData);
        } catch (err) {
            console.error('Unlinking failed:', err);
            alert('Failed to unlink control.');
        }
    };

    const handleSaveKRI = async (data: KRICreate | KRIUpdate) => {
        if (!risk) return;
        try {
            if (selectedKRI) {
                await kriApi.updateKRI(selectedKRI.id, data as KRIUpdate);
            } else {
                await kriApi.createKRI(data as KRICreate);
            }
            await fetchData();
        } catch (err) {
            console.error('KRI Save failed:', err);
            alert('Failed to save KRI.');
        }
    };

    const handleDeleteKRI = async (kriId: number) => {
        try {
            await kriApi.deleteKRI(kriId);
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
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">Loading Risk Data</p>
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
                    <h3 className="text-xl font-bold text-white uppercase tracking-tight">Risk Not Found</h3>
                    <p className="text-slate-500 mt-2 font-medium">The risk ID requested does not exist or has been removed.</p>
                </div>
                <button
                    onClick={() => navigate('/risks')}
                    className="mt-4 px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-all flex items-center gap-2"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to Register
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
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
                            onClick={handleDelete}
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
                <>
                    {/* Risk Matrices - Gross vs Net */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-card"
                    >
                        <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-6">
                            <ShieldAlert className="h-5 w-5 text-accent" />
                            <h3 className="font-bold text-white uppercase tracking-widest text-xs">Risk Assessment</h3>
                        </div>

                        <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24 py-4">
                            <RiskScoreMatrix
                                probability={risk.gross_probability}
                                impact={risk.gross_impact}
                                type="gross"
                                size="medium"
                            />

                            <div className="hidden md:block w-px h-32 bg-white/10" />
                            <div className="md:hidden w-32 h-px bg-white/10" />

                            <RiskScoreMatrix
                                probability={risk.net_probability}
                                impact={risk.net_impact}
                                type="net"
                                size="medium"
                            />
                        </div>
                    </motion.div>

                    <motion.div
                        variants={container}
                        initial="hidden"
                        animate="show"
                        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                    >
                        {/* Classification */}
                        <motion.div variants={item} className="glass-card flex flex-col gap-6">
                            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                                <Tag className="h-5 w-5 text-purple-400" />
                                <h3 className="font-bold text-white uppercase tracking-widest text-xs">Classification</h3>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Type</span>
                                    {(() => {
                                        const typeColor = getColor(risk.risk_type);
                                        return (
                                            <span
                                                className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
                                                style={{
                                                    color: typeColor,
                                                    backgroundColor: hexToRgba(typeColor, 0.12),
                                                }}
                                            >
                                                {getDisplayName(risk.risk_type)}
                                            </span>
                                        );
                                    })()}
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Category</span>
                                    <span className="text-sm text-white font-medium">{risk.category || '—'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Process</span>
                                    <span className="text-sm text-white font-medium">{risk.process}</span>
                                </div>
                                {risk.subprocess && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Subprocess</span>
                                        <span className="text-sm text-slate-300 font-medium">{risk.subprocess}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Priority</span>
                                    <span className={`flex items-center gap-1 text-sm font-bold ${risk.is_priority ? 'text-amber-400' : 'text-slate-400'}`}>
                                        {risk.is_priority ? <><Star className="h-3 w-3 fill-amber-400" /> Yes</> : 'No'}
                                    </span>
                                </div>
                            </div>
                        </motion.div>

                        {/* Ownership */}
                        <motion.div variants={item} className="glass-card flex flex-col gap-6">
                            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                                <User className="h-5 w-5 text-accent" />
                                <h3 className="font-bold text-white uppercase tracking-widest text-xs">Ownership</h3>
                            </div>

                            <div className="space-y-5">
                                <div className="flex gap-3 items-start">
                                    <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold">
                                        {risk.owner?.name?.[0] || 'U'}
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Risk Owner</p>
                                        <p className="text-sm font-bold text-white leading-snug">{risk.owner?.name || 'Unassigned'}</p>
                                        <p className="text-xs text-slate-500">{risk.owner?.email || ''}</p>
                                    </div>
                                </div>
                                <div className="flex gap-3 items-start">
                                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
                                        <Building2 className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Department</p>
                                        <p className="text-sm font-bold text-white leading-snug">{risk.department?.name || 'No Dept'}</p>
                                        <p className="text-xs text-slate-500 font-mono">{risk.department?.code || ''}</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* KRI Section */}
                        <motion.div variants={item} className="glass-card flex flex-col gap-6 md:col-span-2 lg:col-span-3">
                            <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                <div className="flex items-center gap-3">
                                    <FileText className="h-5 w-5 text-amber-400" />
                                    <h3 className="font-bold text-white uppercase tracking-widest text-xs">Risk Appetite Indicators</h3>
                                </div>
                                <PermissionGate resource="risks" action="write">
                                    <button
                                        onClick={() => {
                                            setSelectedKRI(null);
                                            setIsKRIModalOpen(true);
                                        }}
                                        className="px-3 py-1 bg-accent/10 border border-accent/20 rounded-lg text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/20 transition-all font-bold"
                                    >
                                        <Plus className="h-3 w-3 inline mr-1" /> Add KRI
                                    </button>
                                </PermissionGate>
                            </div>

                            {risk.kris && risk.kris.length > 0 ? (
                                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {risk.kris.map(kri => {
                                        const overdueInfo = overdueKRIs.find(o => o.kri_id === kri.id);
                                        return (
                                            <KRIGaugeCard
                                                key={kri.id}
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                kri={kri as any}
                                                isOverdue={!!overdueInfo}
                                                daysOverdue={overdueInfo?.days_overdue}
                                                onClick={() => {
                                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                    setSelectedKRI(kri as any);
                                                    setIsKRIModalOpen(true);
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-white/5 rounded-2xl">
                                    <p className="text-slate-600 text-sm font-medium mb-2">No Key Risk Indicators (KRIs) configured for this risk.</p>
                                    <p className="text-[10px] text-slate-700 max-w-xs mx-auto">KRIs help monitor if the risk remains within the organization's appetite framework.</p>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>

                    {/* Linked Controls */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                        className="glass-card"
                    >
                        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                                <h3 className="font-bold text-white uppercase tracking-widest text-xs">Mitigating Controls</h3>
                            </div>
                            <PermissionGate resource="risks" action="write">
                                <div className="flex items-stretch bg-accent/10 border border-accent/20 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => {
                                            setDialogMode('search-only');
                                            setIsLinkDialogOpen(true);
                                        }}
                                        className="flex items-center gap-2 px-4 py-1.5 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/10 transition-all border-r border-accent/20"
                                    >
                                        <LinkIcon className="h-3 w-3" />
                                        Link Existing
                                    </button>
                                    <button
                                        onClick={() => setIsCreateDialogOpen(true)}
                                        className="flex items-center gap-2 px-3 py-1.5 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/10 transition-all"
                                        title="Create New Control"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        <span>Add control</span>
                                    </button>
                                </div>
                            </PermissionGate>
                        </div>

                        {linkedControls.length === 0 ? (
                            <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl">
                                <p className="text-xs text-slate-600 font-medium">No controls linked to this risk.</p>
                            </div>
                        ) : (
                            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {linkedControls.map((link) => (
                                    <ControlGaugeCard
                                        key={link.id}
                                        link={link}
                                        onClick={() => link.control && navigate(`/controls/${link.control.id}`)}
                                    />
                                ))}
                            </div>
                        )}

                        <PermissionGate resource="risks" action="write">
                            <button
                                onClick={() => {
                                    setDialogMode('links-only');
                                    setIsLinkDialogOpen(true);
                                }}
                                className="w-full mt-6 py-3 border border-dashed border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:border-accent/40 hover:bg-white/5 transition-all"
                            >
                                Manage Existing Links
                            </button>
                        </PermissionGate>

                        <LinkManagementDialog
                            isOpen={isLinkDialogOpen}
                            onClose={() => setIsLinkDialogOpen(false)}
                            mode="risk-to-control"
                            existingLinks={linkedControls}
                            onLink={handleLinkControl}
                            onUnlink={handleUnlinkControl}
                            showSearch={dialogMode !== 'links-only'}
                            showLinks={dialogMode !== 'search-only'}
                        />

                        <ControlCreateDialog
                            isOpen={isCreateDialogOpen}
                            onClose={() => setIsCreateDialogOpen(false)}
                            onSuccess={() => {
                                setIsCreateDialogOpen(false);
                                fetchData();
                            }}
                        />
                    </motion.div>

                    {/* Timestamps */}
                    <div className="flex items-center justify-end gap-6 text-[10px] text-slate-600 font-medium">
                        <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Created: {new Date(risk.created_at).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Updated: {new Date(risk.updated_at).toLocaleDateString()}
                        </div>
                    </div>
                </>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card"
                >
                    <h3 className="text-xs font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                        <History className="h-4 w-4 text-accent" />
                        Aggregated KRI History
                        {kriHistoryItems.length > 0 && (
                            <span className="text-slate-500 font-normal">({kriHistoryItems.length} entries)</span>
                        )}
                    </h3>

                    <HistoryTimeline
                        items={kriHistoryItems}
                        loading={isHistoryLoading}
                        emptyMessage={
                            risk.kris && risk.kris.length > 0
                                ? 'No KRI values have been recorded yet.'
                                : 'This risk has no KRIs configured. Add KRIs from the Overview tab to start tracking history.'
                        }
                    />
                </motion.div>
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
        </div>
    );
}
