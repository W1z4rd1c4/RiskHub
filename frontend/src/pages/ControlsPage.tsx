import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus,
    Search,
    Calendar,
    ChevronRight,
    ChevronLeft,
    RefreshCw,
    AlertCircle
} from 'lucide-react';
import { controlApi } from '@/services/controlApi';
import type { ControlSummary } from '@/types/control';
import { ControlStatus } from '@/types/control';
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

export function ControlsPage() {
    const navigate = useNavigate();
    const { mockUserId } = useAuth();

    // State
    const [controls, setControls] = useState<ControlSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [skip, setSkip] = useState(0);
    const limit = 10;

    const fetchControls = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await controlApi.getControls({
                skip,
                limit,
                search: search || undefined,
                status: statusFilter || undefined,
                mockUserId
            });
            setControls(data);
            setError(null);
        } catch (err) {
            console.error('Error fetching controls:', err);
            setError('Failed to load controls. Please check your connection.');
        } finally {
            setIsLoading(false);
        }
    }, [skip, search, statusFilter, mockUserId]);

    useEffect(() => {
        fetchControls();
    }, [fetchControls]);

    const getRiskLevelColor = (level: number) => {
        if (level >= 5) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
        if (level >= 4) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
        if (level >= 3) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
        if (level >= 2) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
        return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    };

    const getStatusColor = (status: ControlStatus) => {
        switch (status) {
            case ControlStatus.ACTIVE: return 'text-emerald-400 bg-emerald-400/10';
            case ControlStatus.DRAFT: return 'text-slate-400 bg-slate-400/10';
            case ControlStatus.INACTIVE: return 'text-rose-400 bg-rose-400/10';
            case ControlStatus.ARCHIVED: return 'text-yellow-400 bg-yellow-400/10';
            default: return 'text-slate-400 bg-slate-400/10';
        }
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">Control Catalog</h2>
                    <p className="text-slate-500 font-medium tracking-tight">Manage and audit organizational risk controls according to the 13-point standard.</p>
                </div>
                <PermissionGate resource="controls" action="write">
                    <button
                        onClick={() => navigate('/controls/new')}
                        className="btn-primary"
                    >
                        <Plus className="h-5 w-5" />
                        New Control
                    </button>
                </PermissionGate>
            </div>

            {/* Filters Bar */}
            <div className="glass-card flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                    <input
                        type="text"
                        placeholder="Search by name or description..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                    />
                </div>
                <div className="flex gap-4">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-300 outline-none focus:border-accent/50 appearance-none min-w-[140px]"
                    >
                        <option value="" className="bg-slate-900">All Statuses</option>
                        <option value="active" className="bg-slate-900">Active</option>
                        <option value="draft" className="bg-slate-900">Draft</option>
                        <option value="inactive" className="bg-slate-900">Inactive</option>
                    </select>
                    <button
                        onClick={() => fetchControls()}
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
                            <p className="text-white font-bold text-xl">Error Loading Controls</p>
                            <p className="text-slate-500 max-w-sm mx-auto">{error}</p>
                        </div>
                        <button onClick={fetchControls} className="text-accent font-bold hover:underline">Try Again</button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/[0.02]">
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Name & ID</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Department</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Frequency</th>
                                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Risk Level</th>
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
                                                <td className="px-6 py-4"><div className="h-4 w-40 bg-white/5 rounded" /></td>
                                                <td className="px-6 py-4"><div className="h-4 w-24 bg-white/5 rounded" /></td>
                                                <td className="px-6 py-4"><div className="h-4 w-20 bg-white/5 rounded" /></td>
                                                <td className="px-6 py-4 flex justify-center"><div className="h-6 w-12 bg-white/5 rounded-full" /></td>
                                                <td className="px-6 py-4"><div className="h-6 w-16 bg-white/5 rounded-full" /></td>
                                                <td className="px-6 py-4"><div className="h-4 w-10 bg-white/5 rounded ml-auto" /></td>
                                            </tr>
                                        ))
                                    ) : controls.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-20 text-center">
                                                <p className="text-slate-500 font-medium">No controls found matching your criteria.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        controls.map((control) => (
                                            <motion.tr
                                                key={control.id}
                                                variants={item}
                                                onClick={() => navigate(`/controls/${control.id}`)}
                                                className="border-b border-white/5 hover:bg-white/[0.03] transition-colors cursor-pointer group"
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-white group-hover:text-accent transition-colors">{control.name}</span>
                                                        <span className="text-[10px] font-mono text-slate-500">#CTL-{String(control.id).padStart(4, '0')}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-xs font-medium text-slate-300">{control.department_name || 'Unassigned'}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2 text-xs text-slate-400 capitalize">
                                                        <Calendar className="h-3 w-3 text-accent" />
                                                        {control.frequency}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex justify-center">
                                                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${getRiskLevelColor(control.risk_level)}`}>
                                                            {control.risk_level} / 5
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${getStatusColor(control.status)}`}>
                                                        {control.status}
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
                            disabled={controls.length < limit || isLoading}
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

