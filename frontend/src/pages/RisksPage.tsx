import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus,
    Search,
    ChevronRight,
    ChevronLeft,
    RefreshCw,
    AlertCircle,
    Shield,
    Star
} from 'lucide-react';
import { riskApi } from '@/services/riskApi';
import type { RiskSummary, RiskType, RiskStatus } from '@/types/risk';
import { useAuth } from '@/contexts/AuthContext';
import { PermissionGate } from '@/components/PermissionGate';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.05 }
    }
};

const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
};

export function RisksPage() {
    const navigate = useNavigate();
    const { mockUserId } = useAuth();

    // State
    const [risks, setRisks] = useState<RiskSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<RiskStatus | ''>('');
    const [typeFilter, setTypeFilter] = useState<RiskType | ''>('');
    const [priorityFilter, setPriorityFilter] = useState<boolean | undefined>(undefined);
    const [skip, setSkip] = useState(0);
    const limit = 10;

    const fetchRisks = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await riskApi.getRisks({
                skip,
                limit,
                search: search || undefined,
                status: statusFilter || undefined,
                risk_type: typeFilter || undefined,
                is_priority: priorityFilter,
                mockUserId
            });
            setRisks(data);
            setError(null);
        } catch (err) {
            console.error('Error fetching risks:', err);
            setError('Failed to load risks. Please check your connection.');
        } finally {
            setIsLoading(false);
        }
    }, [skip, search, statusFilter, typeFilter, priorityFilter, mockUserId]);

    useEffect(() => {
        fetchRisks();
    }, [fetchRisks]);

    // Score color coding: 1-4 green, 5-9 yellow, 10-15 amber, 16-25 red
    const getScoreColor = (score: number) => {
        if (score >= 16) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
        if (score >= 10) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
        if (score >= 5) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
        return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    };

    const getStatusColor = (status: RiskStatus) => {
        switch (status) {
            case 'active': return 'text-emerald-400 bg-emerald-400/10';
            case 'monitoring': return 'text-amber-400 bg-amber-400/10';
            case 'closed': return 'text-slate-400 bg-slate-400/10';
            case 'archived': return 'text-rose-400 bg-rose-400/10';
            default: return 'text-slate-400 bg-slate-400/10';
        }
    };

    const getTypeColor = (type: RiskType) => {
        return type === 'strategic'
            ? 'text-purple-400 bg-purple-400/10'
            : 'text-blue-400 bg-blue-400/10';
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">Risk Register</h2>
                    <p className="text-slate-500 font-medium tracking-tight">Track and manage organizational risks with gross/net scoring from OS 18.</p>
                </div>
                <PermissionGate resource="risks" action="write">
                    <button
                        onClick={() => navigate('/risks/new')}
                        className="btn-primary"
                    >
                        <Plus className="h-5 w-5" />
                        New Risk
                    </button>
                </PermissionGate>
            </div>

            {/* Filters Bar */}
            <div className="glass-card flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                    <input
                        type="text"
                        placeholder="Search by ID, process, or category..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                    />
                </div>
                <div className="flex gap-3 flex-wrap">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as RiskStatus | '')}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-300 outline-none focus:border-accent/50 appearance-none min-w-[130px]"
                    >
                        <option value="" className="bg-slate-900">All Statuses</option>
                        <option value="active" className="bg-slate-900">Active</option>
                        <option value="monitoring" className="bg-slate-900">Monitoring</option>
                        <option value="closed" className="bg-slate-900">Closed</option>
                    </select>
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as RiskType | '')}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-300 outline-none focus:border-accent/50 appearance-none min-w-[130px]"
                    >
                        <option value="" className="bg-slate-900">All Types</option>
                        <option value="strategic" className="bg-slate-900">Strategic</option>
                        <option value="operational" className="bg-slate-900">Operational</option>
                    </select>
                    <button
                        onClick={() => setPriorityFilter(priorityFilter === true ? undefined : true)}
                        className={`px-4 py-2.5 rounded-xl border text-sm font-bold transition-all flex items-center gap-2 ${priorityFilter === true
                            ? 'bg-amber-400/20 border-amber-400/50 text-amber-400'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                            }`}
                    >
                        <Star className="h-4 w-4" />
                        Priority
                    </button>
                    <button
                        onClick={() => fetchRisks()}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors"
                    >
                        <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Table Area */}
            <div className="glass-card !p-0 overflow-hidden">
                {error ? (
                    <div className="p-20 flex flex-col items-center justify-center text-center gap-4">
                        <AlertCircle className="h-12 w-12 text-rose-500" />
                        <div>
                            <p className="text-white font-bold text-xl">Error Loading Risks</p>
                            <p className="text-slate-500 max-w-sm mx-auto">{error}</p>
                        </div>
                        <button onClick={fetchRisks} className="text-accent font-bold hover:underline">Try Again</button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/[0.02]">
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Risk ID</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Process</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Type</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Category</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Gross</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Net</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Actions</th>
                                </tr>
                            </thead>
                            <motion.tbody
                                variants={container}
                                initial="hidden"
                                animate="show"
                            >
                                <AnimatePresence mode="popLayout">
                                    {isLoading ? (
                                        [...Array(limit)].map((_, i) => (
                                            <tr key={`skeleton-${i}`} className="border-b border-white/5 animate-pulse">
                                                <td className="px-6 py-4"><div className="h-4 w-24 bg-white/5 rounded" /></td>
                                                <td className="px-6 py-4"><div className="h-4 w-32 bg-white/5 rounded" /></td>
                                                <td className="px-6 py-4"><div className="h-5 w-20 bg-white/5 rounded-md" /></td>
                                                <td className="px-6 py-4"><div className="h-4 w-24 bg-white/5 rounded" /></td>
                                                <td className="px-6 py-4 flex justify-center"><div className="h-6 w-10 bg-white/5 rounded-full" /></td>
                                                <td className="px-6 py-4"><div className="h-6 w-10 bg-white/5 rounded-full mx-auto" /></td>
                                                <td className="px-6 py-4"><div className="h-5 w-16 bg-white/5 rounded-md" /></td>
                                                <td className="px-6 py-4"><div className="h-4 w-10 bg-white/5 rounded ml-auto" /></td>
                                            </tr>
                                        ))
                                    ) : risks.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-20 text-center">
                                                <Shield className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                                                <p className="text-slate-500 font-medium">No risks found matching your criteria.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        risks.map((risk) => (
                                            <motion.tr
                                                key={risk.id}
                                                variants={item}
                                                onClick={() => navigate(`/risks/${risk.id}`)}
                                                className="border-b border-white/5 hover:bg-white/[0.03] transition-colors cursor-pointer group"
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-white group-hover:text-accent transition-colors font-mono">{risk.risk_id_code}</span>
                                                        {risk.is_priority && (
                                                            <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-xs font-medium text-slate-300">{risk.process}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${getTypeColor(risk.risk_type)}`}>
                                                        {risk.risk_type === 'strategic' ? 'S' : 'O'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-xs text-slate-400">{risk.category || '—'}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex justify-center">
                                                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getScoreColor(risk.gross_score)}`}>
                                                            {risk.gross_score}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex justify-center">
                                                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getScoreColor(risk.net_score)}`}>
                                                            {risk.net_score}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${getStatusColor(risk.status)}`}>
                                                        {risk.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button className="p-2 text-slate-500 hover:text-white transition-colors">
                                                        <ChevronRight className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </motion.tr>
                                        ))
                                    )}
                                </AnimatePresence>
                            </motion.tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-white/[0.01]">
                    <p className="text-xs text-slate-500 font-medium font-mono uppercase tracking-widest">
                        Page {Math.floor(skip / limit) + 1}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setSkip(Math.max(0, skip - limit))}
                            disabled={skip === 0 || isLoading}
                            className="p-1.5 rounded-lg border border-white/5 text-slate-500 hover:text-white hover:bg-white/5 disabled:opacity-20 transition-all"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setSkip(skip + limit)}
                            disabled={risks.length < limit || isLoading}
                            className="p-1.5 rounded-lg border border-white/5 text-slate-500 hover:text-white hover:bg-white/5 disabled:opacity-20 transition-all"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
