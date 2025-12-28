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
    Plus
} from 'lucide-react';
import { riskApi } from '@/services/riskApi';
import type { Risk, RiskControlLink, ControlEffectiveness } from '@/types/risk';
import { PermissionGate } from '@/components/PermissionGate';
import { RiskScoreMatrix } from '@/components/RiskScoreMatrix';
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import { KRIGaugeCard } from '@/components/kri/KRIGaugeCard';
import { KRIModal } from '@/components/kri/KRIModal';
import { kriApi } from '@/services/kriApi';
import type { KeyRiskIndicator, KRICreate, KRIUpdate } from '@/types/kri';

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
    const [risk, setRisk] = useState<Risk | null>(null);
    const [linkedControls, setLinkedControls] = useState<RiskControlLink[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);

    // KRI Modal State
    const [isKRIModalOpen, setIsKRIModalOpen] = useState(false);
    const [selectedKRI, setSelectedKRI] = useState<KeyRiskIndicator | null>(null);

    const fetchData = useCallback(async () => {
        if (!id) return;
        try {
            setIsLoading(true);
            const riskId = parseInt(id);
            const [riskData, controlsData] = await Promise.all([
                riskApi.getRisk(riskId),
                riskApi.getLinkedControls(riskId)
            ]);
            setRisk(riskData);
            setLinkedControls(controlsData);
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
            // Refresh linked controls
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
            // Refresh linked controls
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
            // Refresh risk data to get updated KRIs
            await fetchData();
        } catch (err) {
            console.error('KRI Save failed:', err);
            alert('Failed to save KRI.');
        }
    };

    const handleDeleteKRI = async (kriId: number) => {
        try {
            await kriApi.deleteKRI(kriId);
            // Refresh risk data
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

    const getEffectivenessColor = (effectiveness: string) => {
        switch (effectiveness) {
            case 'high': return 'text-emerald-400 bg-emerald-400/10';
            case 'medium': return 'text-amber-400 bg-amber-400/10';
            case 'low': return 'text-rose-400 bg-rose-400/10';
            default: return 'text-slate-400 bg-slate-400/10';
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
                        <h2 className="text-4xl font-black text-white tracking-tighter">{risk.process}</h2>
                        {risk.is_priority && (
                            <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
                        )}
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getStatusColor(risk.status)}`}>
                            {risk.status}
                        </span>
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
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${risk.risk_type === 'strategic'
                                ? 'text-purple-400 bg-purple-400/10'
                                : 'text-blue-400 bg-blue-400/10'
                                }`}>
                                {risk.risk_type}
                            </span>
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
                            {risk.kris.map(kri => (
                                <KRIGaugeCard
                                    key={kri.id}
                                    kri={kri as any}
                                    onClick={() => {
                                        setSelectedKRI(kri as any);
                                        setIsKRIModalOpen(true);
                                    }}
                                />
                            ))}
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
                        <button
                            onClick={() => setIsLinkDialogOpen(true)}
                            className="px-3 py-1 bg-accent/10 border border-accent/20 rounded-lg text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/20 transition-all"
                        >
                            <Plus className="h-3 w-3 inline mr-1" /> Add Control
                        </button>
                    </PermissionGate>
                </div>

                <div className="space-y-3">
                    {linkedControls.length === 0 ? (
                        <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl">
                            <p className="text-xs text-slate-600 font-medium">No controls linked to this risk.</p>
                        </div>
                    ) : (
                        linkedControls.map((link) => (
                            <div
                                key={link.id}
                                onClick={() => link.control && navigate(`/controls/${link.control.id}`)}
                                className="group p-4 bg-white/[0.03] border border-white/5 rounded-2xl hover:bg-white/[0.05] hover:border-accent/30 transition-all cursor-pointer"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-sm font-bold text-white group-hover:text-accent transition-colors">{link.control?.name || 'Unknown Control'}</span>
                                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${getEffectivenessColor(link.effectiveness)}`}>
                                        {link.effectiveness}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-[10px] text-slate-500 font-medium">
                                    <span>Frequency: {link.control?.frequency || '—'}</span>
                                    <span>Risk Level: {link.control?.risk_level || '—'}/5</span>
                                </div>
                                {link.notes && <p className="mt-2 text-[10px] text-slate-500 font-medium italic">"{link.notes}"</p>}
                            </div>
                        ))
                    )}
                    <PermissionGate resource="risks" action="write">
                        <button
                            onClick={() => setIsLinkDialogOpen(true)}
                            className="w-full py-3 border border-dashed border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:border-accent/40 hover:bg-white/5 transition-all"
                        >
                            Manage Control Linkage
                        </button>
                    </PermissionGate>
                </div>

                <LinkManagementDialog
                    isOpen={isLinkDialogOpen}
                    onClose={() => setIsLinkDialogOpen(false)}
                    mode="risk-to-control"
                    existingLinks={linkedControls}
                    onLink={handleLinkControl}
                    onUnlink={handleUnlinkControl}
                />
            </motion.div>

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
        </div>
    );
}
