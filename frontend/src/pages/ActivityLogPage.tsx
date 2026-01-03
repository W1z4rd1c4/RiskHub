import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity,
    Search,
    Calendar,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    ArrowRight,
    Clock,
    XCircle,
    Archive,
    Plus,
    Edit2,
    Link as LinkIcon,
    Unlink,
    CheckCircle2
} from 'lucide-react';
import { activityLogApi, type ActivityLogFilters } from '@/services/activityLogApi';
import type { ActivityLogEntry } from '@/types/activityLog';
import { ENTITY_TYPE_LABELS, ACTION_LABELS, ACTION_COLORS } from '@/types/activityLog';
import { formatDistanceToNow, format } from 'date-fns';

export function ActivityLogPage() {
    // State
    const [activeTab, setActiveTab] = useState('kri');
    const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [limit] = useState(50);

    // Filters
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [action, setAction] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Filter options
    const [actions, setActions] = useState<string[]>([]);

    // Search debounce
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Load filter options
    useEffect(() => {
        const loadOptions = async () => {
            try {
                const acts = await activityLogApi.getActions();
                setActions(acts);
            } catch (err) {
                console.error('Failed to load filter options:', err);
            }
        };
        loadOptions();
    }, []);

    const fetchEntries = useCallback(async () => {
        setIsLoading(true);
        try {
            let entityTypes: string[] | undefined;

            // Map tabs to entity types
            switch (activeTab) {
                case 'kri':
                    entityTypes = ['kri', 'kri_value'];
                    break;
                case 'risk':
                    entityTypes = ['risk'];
                    break;
                case 'control':
                    entityTypes = ['control', 'control_execution', 'control_risk_link'];
                    break;
                case 'user':
                    entityTypes = ['user', 'role', 'department', 'approval', 'config'];
                    break;
                default:
                    entityTypes = undefined;
            }

            const filters: ActivityLogFilters = {
                skip: page * limit,
                limit,
                search: debouncedSearch || undefined,
                entity_type: entityTypes,
                action: action || undefined,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
            };
            const response = await activityLogApi.list(filters);
            setEntries(response.items);
            setTotal(response.total);
        } catch (error) {
            console.error('Failed to fetch activity logs:', error);
        } finally {
            setIsLoading(false);
        }
    }, [page, limit, debouncedSearch, activeTab, action, dateFrom, dateTo]);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'create': return <Plus className="h-3 w-3" />;
            case 'update': return <Edit2 className="h-3 w-3" />;
            case 'delete': return <XCircle className="h-3 w-3" />;
            case 'archive': return <Archive className="h-3 w-3" />;
            case 'approve': return <CheckCircle2 className="h-3 w-3" />;
            case 'reject': return <XCircle className="h-3 w-3" />;
            case 'link': return <LinkIcon className="h-3 w-3" />;
            case 'unlink': return <Unlink className="h-3 w-3" />;
            case 'status_change': return <RefreshCw className="h-3 w-3" />;
            default: return <Activity className="h-3 w-3" />;
        }
    };

    const tabs = [
        { id: 'kri', label: 'KRI' },
        { id: 'risk', label: 'Risk' },
        { id: 'control', label: 'Controls' },
        { id: 'user', label: 'Users' },
    ];

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent/10 rounded-xl">
                        <Activity className="h-6 w-6 text-accent" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold">Activity Log</h1>
                        <p className="text-slate-400 text-sm">Monitor system-wide changes and compliance events</p>
                    </div>
                </div>
                <button
                    onClick={() => fetchEntries()}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white"
                    title="Refresh Log"
                >
                    <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setPage(0); }}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeTab === tab.id
                                ? 'bg-accent text-white shadow-lg shadow-accent/25'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Filters Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-6 glass-card rounded-3xl border border-white/5">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search logs..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-black/20 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all"
                    />
                </div>

                <div className="flex gap-2">
                    <select
                        value={action}
                        onChange={(e) => setAction(e.target.value)}
                        className="w-full bg-black/20 border border-white/5 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-accent/50 transition-all appearance-none cursor-pointer"
                    >
                        <option value="">All Actions</option>
                        {actions.map(act => (
                            <option key={act} value={act}>{ACTION_LABELS[act] || act}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full bg-black/20 border border-white/5 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-accent/50 transition-all"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full bg-black/20 border border-white/5 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-accent/50 transition-all"
                    />
                </div>
            </div>

            {/* Entries List */}
            <div className="flex flex-col gap-3">
                {isLoading && entries.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-24 w-full bg-white/5 animate-pulse rounded-2xl border border-white/5" />
                    ))
                ) : entries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-3xl border border-white/5 text-slate-400">
                        <Activity className="h-12 w-12 mb-4 opacity-20" />
                        <p>No activity logs found</p>
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        {entries.map((entry) => (
                            <motion.div
                                key={entry.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="group p-5 glass-card rounded-2xl border border-white/5 hover:border-accent/30 transition-all relative overflow-hidden"
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`p-2 rounded-xl shrink-0 ${ACTION_COLORS[entry.action] || 'text-slate-400 bg-white/10'}`}>
                                        {getActionIcon(entry.action)}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className="font-semibold text-slate-200">{entry.actor_name}</span>
                                                <span className="text-slate-500">{ACTION_LABELS[entry.action]}</span>
                                                <span className="font-medium text-accent/80">{ENTITY_TYPE_LABELS[entry.entity_type]}</span>
                                                <span className="text-slate-200 truncate font-medium">"{entry.entity_name}"</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                                <div className="flex items-center gap-1.5" title={format(new Date(entry.created_at), 'PPP pp')}>
                                                    <Clock className="h-3 w-3" />
                                                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-sm text-slate-400 line-clamp-1">{entry.description}</p>

                                        {entry.changes && Object.keys(entry.changes).length > 0 && (
                                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                {Object.entries(entry.changes).map(([field, delta]) => (
                                                    <div key={field} className="text-[11px] bg-black/30 rounded-lg p-2 border border-white/5">
                                                        <div className="text-slate-500 uppercase tracking-wider font-bold mb-1">{field.replace('_', ' ')}</div>
                                                        <div className="flex items-center gap-1.5 overflow-hidden">
                                                            <span className="text-rose-400/80 truncate line-through max-w-[80px]" title={String(delta.old)}>
                                                                {String(delta.old || 'none')}
                                                            </span>
                                                            <ArrowRight className="h-2.5 w-2.5 text-slate-600 shrink-0" />
                                                            <span className="text-emerald-400 truncate" title={String(delta.new)}>
                                                                {String(delta.new || 'none')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>

            {/* Pagination */}
            {total > limit && (
                <div className="flex items-center justify-between px-2 text-slate-400">
                    <div className="text-sm">
                        Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total} entries
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0 || isLoading}
                            className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 rounded-xl transition-all"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.ceil(total / limit) }).map((_, i) => {
                                if (i === 0 || i === Math.ceil(total / limit) - 1 || (i >= page - 1 && i <= page + 1)) {
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => setPage(i)}
                                            className={`h-9 w-9 text-sm rounded-xl transition-all ${page === i ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'hover:bg-white/10'
                                                }`}
                                        >
                                            {i + 1}
                                        </button>
                                    );
                                }
                                if (i === page - 2 || i === page + 2) return <span key={i} className="px-1 text-slate-600">...</span>;
                                return null;
                            })}
                        </div>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={(page + 1) * limit >= total || isLoading}
                            className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 rounded-xl transition-all"
                        >
                            <ChevronRight className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
