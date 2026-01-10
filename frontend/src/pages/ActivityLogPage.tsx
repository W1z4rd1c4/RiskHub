import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity,
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
    CheckCircle2,
    ShieldX,
    AlertCircle
} from 'lucide-react';
import type { ActivityLogEntry } from '@/types/activityLog';
import { ENTITY_TYPE_LABELS, ACTION_LABELS, ACTION_COLORS } from '@/types/activityLog';
import { formatDistanceToNow, format } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';
import { useActivityLogPageState, type ActiveTab } from '@/hooks/useActivityLogPageState';
import { ActivityLogFilterBar } from '@/components/activity-log/ActivityLogFilterBar';

// ─────────────────────────────────────────────────────────────
// Helper functions for rendering
// ─────────────────────────────────────────────────────────────

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

/**
 * Formats a value for diff display, handling edge cases:
 * - null/undefined → "(empty)"
 * - objects/arrays → truncated JSON
 * - primitives → string representation
 * Uses ?? to preserve falsy values like 0, false, ""
 */
const formatDiffValue = (value: unknown): string => {
    if (value === null || value === undefined) {
        return '(empty)';
    }
    if (typeof value === 'object') {
        const json = JSON.stringify(value);
        // Truncate large values
        return json.length > 80 ? json.slice(0, 77) + '...' : json;
    }
    // Preserve falsy values like 0, false, ""
    return String(value);
};

/**
 * Safely extracts old/new from a delta value.
 * Handles various shapes:
 * - {old, new} → standard diff
 * - primitive → show as new value only
 * - null → empty diff
 */
const getDiffPair = (delta: unknown): { old: string; new: string; isLegacy: boolean } => {
    // Null or primitive: treat as "set to value" (no old)
    if (delta === null || delta === undefined) {
        return { old: '(empty)', new: '(empty)', isLegacy: true };
    }
    if (typeof delta !== 'object') {
        // Legacy: bare primitive value
        return { old: '(empty)', new: formatDiffValue(delta), isLegacy: true };
    }
    // Standard {old, new} shape
    const d = delta as { old?: unknown; new?: unknown };
    return {
        old: formatDiffValue(d.old),
        new: formatDiffValue(d.new),
        isLegacy: !('old' in d && 'new' in d)
    };
};

// ─────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────

const TABS: { id: ActiveTab; label: string }[] = [
    { id: 'kri', label: 'KRI' },
    { id: 'risk', label: 'Risk' },
    { id: 'control', label: 'Controls' },
    { id: 'user', label: 'Users' },
];

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function ActivityLogPage() {
    const { canViewActivityLog } = usePermissions();

    // Permission gate - early return if user lacks permission
    // This prevents any API calls from being made
    if (!canViewActivityLog) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="p-4 bg-rose-500/10 rounded-2xl">
                    <ShieldX className="h-12 w-12 text-rose-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">Access Denied</h2>
                <p className="text-slate-400 text-center max-w-md">
                    You don't have permission to view the Activity Log.
                    Contact your administrator if you believe this is an error.
                </p>
            </div>
        );
    }

    // All state management delegated to the hook
    const state = useActivityLogPageState();

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
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
                    onClick={() => state.refresh()}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white"
                    title="Refresh Log"
                >
                    <RefreshCw className={`h-5 w-5 ${state.isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => state.setActiveTab(tab.id)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${state.activeTab === tab.id
                            ? 'bg-accent text-white shadow-lg shadow-accent/25'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Filter Bar (view mode + filters) */}
            <ActivityLogFilterBar
                search={state.search}
                onSearchChange={state.setSearch}
                action={state.action}
                onActionChange={state.setAction}
                actions={state.actions}
                dateFrom={state.dateFrom}
                onDateFromChange={state.setDateFrom}
                dateTo={state.dateTo}
                onDateToChange={state.setDateTo}
                viewMode={state.viewMode}
                onViewModeChange={state.setViewMode}
                selectedActorId={state.selectedActorId}
                onActorChange={(id) => { state.setSelectedActorId(id); state.setPage(0); }}
                selectedDepartmentId={state.selectedDepartmentId}
                onDepartmentChange={(id) => { state.setSelectedDepartmentId(id); state.setPage(0); }}
                selectedRiskId={state.selectedRiskId}
                onRiskChange={(id) => { state.setSelectedRiskId(id); state.setPage(0); }}
                users={state.users}
                departments={state.departments}
                risks={state.risks}
            />

            {/* Entries List */}
            <ActivityLogEntries
                entries={state.entries}
                total={state.total}
                isLoading={state.isLoading}
                errorType={state.errorType}
                onRetry={state.refresh}
            />

            {/* Pagination */}
            {state.total > state.limit && (
                <ActivityLogPagination
                    page={state.page}
                    setPage={state.setPage}
                    limit={state.limit}
                    total={state.total}
                    isLoading={state.isLoading}
                />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Entry list component (local to this file)
// ─────────────────────────────────────────────────────────────

interface ActivityLogEntriesProps {
    entries: ActivityLogEntry[];
    total: number;
    isLoading: boolean;
    errorType: 'access_denied' | 'network_error' | null;
    onRetry: () => void;
}

function ActivityLogEntries({ entries, isLoading, errorType, onRetry }: ActivityLogEntriesProps) {
    if (isLoading && entries.length === 0) {
        return (
            <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-24 w-full bg-white/5 animate-pulse rounded-2xl border border-white/5" />
                ))}
            </div>
        );
    }

    if (errorType === 'access_denied') {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-rose-500/5 rounded-3xl border border-rose-500/20 text-rose-400">
                <ShieldX className="h-12 w-12 mb-4" />
                <p className="font-semibold">Access Denied</p>
                <p className="text-sm text-slate-500 mt-1">You don't have permission to view activity logs.</p>
            </div>
        );
    }

    if (errorType === 'network_error') {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-amber-500/5 rounded-3xl border border-amber-500/20 text-amber-400">
                <AlertCircle className="h-12 w-12 mb-4" />
                <p className="font-semibold">Failed to Load</p>
                <p className="text-sm text-slate-500 mt-1">There was an error loading activity logs. Please try again.</p>
                <button
                    onClick={onRetry}
                    className="mt-4 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 rounded-xl text-sm transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-3xl border border-white/5 text-slate-400">
                <Activity className="h-12 w-12 mb-4 opacity-20" />
                <p>No activity logs found</p>
                <p className="text-sm text-slate-500 mt-1">Try adjusting your filters or date range.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
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
                                        <span className="text-slate-500">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                                        <span className="font-medium text-accent/80">{ENTITY_TYPE_LABELS[entry.entity_type] ?? entry.entity_type}</span>
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
                                        {Object.entries(entry.changes).map(([field, delta]) => {
                                            const { old: oldVal, new: newVal } = getDiffPair(delta);
                                            return (
                                                <div key={field} className="text-[11px] bg-black/30 rounded-lg p-2 border border-white/5">
                                                    <div className="text-slate-500 uppercase tracking-wider font-bold mb-1">{field.replace(/_/g, ' ')}</div>
                                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                                        <span className="text-rose-400/80 truncate line-through max-w-[80px]" title={oldVal}>
                                                            {oldVal}
                                                        </span>
                                                        <ArrowRight className="h-2.5 w-2.5 text-slate-600 shrink-0" />
                                                        <span className="text-emerald-400 truncate" title={newVal}>
                                                            {newVal}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Pagination component (local to this file)
// ─────────────────────────────────────────────────────────────

interface ActivityLogPaginationProps {
    page: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
    limit: number;
    total: number;
    isLoading: boolean;
}

function ActivityLogPagination({ page, setPage, limit, total, isLoading }: ActivityLogPaginationProps) {
    const totalPages = Math.ceil(total / limit);
    // Build a bounded page window to avoid O(totalPages) rendering
    const pageNumbers: (number | 'ellipsis')[] = [];
    const addPage = (p: number) => {
        if (p >= 0 && p < totalPages && !pageNumbers.includes(p)) {
            pageNumbers.push(p);
        }
    };
    // Always show first page
    addPage(0);
    // Show current page ± 1
    addPage(page - 1);
    addPage(page);
    addPage(page + 1);
    // Always show last page
    addPage(totalPages - 1);
    // Sort and insert ellipses where gaps exist
    pageNumbers.sort((a, b) => (a as number) - (b as number));
    const withEllipses: (number | 'ellipsis')[] = [];
    for (let i = 0; i < pageNumbers.length; i++) {
        if (i > 0 && (pageNumbers[i] as number) - (pageNumbers[i - 1] as number) > 1) {
            withEllipses.push('ellipsis');
        }
        withEllipses.push(pageNumbers[i]);
    }

    return (
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
                    {withEllipses.map((item, idx) =>
                        item === 'ellipsis' ? (
                            <span key={`ellipsis-${idx}`} className="px-1 text-slate-600">...</span>
                        ) : (
                            <button
                                key={item}
                                onClick={() => setPage(item)}
                                className={`h-9 w-9 text-sm rounded-xl transition-all ${page === item ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'hover:bg-white/10'
                                    }`}
                            >
                                {item + 1}
                            </button>
                        )
                    )}
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
    );
}
