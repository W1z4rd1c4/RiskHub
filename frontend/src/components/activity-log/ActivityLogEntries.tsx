import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity,
    AlertCircle,
    Archive,
    ArrowRight,
    CheckCircle2,
    Clock,
    Edit2,
    Link as LinkIcon,
    Plus,
    RefreshCw,
    ShieldX,
    Unlink,
    XCircle,
} from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { formatDateTimeValue, formatRelativeDateValue } from '@/i18n/formatters';
import type { ActivityLogEntry } from '@/types/activityLog';
import { ACTION_COLORS, ACTION_LABELS, getActivityEntityLabel } from '@/types/activityLog';

import { getDiffPair } from './activityLogPresentation';

interface ActivityLogEntriesProps {
    entries: ActivityLogEntry[];
    isLoading: boolean;
    errorType: 'access_denied' | 'network_error' | null;
    needsRiskSelection?: boolean;
    onRetry: () => void;
}

const getActionIcon = (action: string) => {
    switch (action) {
        case 'create':
            return <Plus className="h-3 w-3" />;
        case 'update':
            return <Edit2 className="h-3 w-3" />;
        case 'delete':
            return <XCircle className="h-3 w-3" />;
        case 'archive':
            return <Archive className="h-3 w-3" />;
        case 'approve':
            return <CheckCircle2 className="h-3 w-3" />;
        case 'reject':
            return <XCircle className="h-3 w-3" />;
        case 'link':
            return <LinkIcon className="h-3 w-3" />;
        case 'unlink':
            return <Unlink className="h-3 w-3" />;
        case 'status_change':
            return <RefreshCw className="h-3 w-3" />;
        default:
            return <Activity className="h-3 w-3" />;
    }
};

const normalizeActivityLabel = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export function ActivityLogEntries({ entries, isLoading, errorType, needsRiskSelection = false, onRetry }: ActivityLogEntriesProps) {
    const { t, i18n } = useTranslation('common');

    if (isLoading && entries.length === 0) {
        return (
            <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }).map((_, index) => (
                    <div
                        key={index}
                        className="h-24 w-full animate-pulse rounded-2xl border border-white/5 bg-white/5"
                    />
                ))}
            </div>
        );
    }

    if (errorType === 'access_denied') {
        return (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-rose-500/20 bg-rose-500/5 py-20 text-rose-400">
                <ShieldX className="mb-4 h-12 w-12" />
                <p className="font-semibold">{t('access.denied')}</p>
                <p className="mt-1 text-sm text-slate-500">{t('access.denied_activity_log')}</p>
            </div>
        );
    }

    if (errorType === 'network_error') {
        return (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-amber-500/20 bg-amber-500/5 py-20 text-amber-400">
                <AlertCircle className="mb-4 h-12 w-12" />
                <p className="font-semibold">{t('activity_log.failed_to_load')}</p>
                <p className="mt-1 text-sm text-slate-500">{t('activity_log.failed_to_load_help')}</p>
                <button
                    onClick={onRetry}
                    className="mt-4 rounded-xl bg-amber-500/20 px-4 py-2 text-sm transition-colors hover:bg-amber-500/30"
                >
                    {t('actions.refresh')}
                </button>
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-white/5 bg-white/5 py-20 text-slate-400">
                <Activity className="mb-4 h-12 w-12 opacity-20" />
                <p>{needsRiskSelection ? 'Select a risk to view activity.' : t('empty.no_activity_logs')}</p>
                <p className="mt-1 text-sm text-slate-500">
                    {needsRiskSelection ? 'Choose a risk in the filter above to load entries.' : t('activity_log.try_adjusting_filters')}
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
                {entries.map((entry) => (
                    <motion.div
                        key={entry.id}
                        data-testid="activity-entry"
                        data-entity-type={entry.entity_type}
                        data-action={entry.action}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="group relative overflow-hidden rounded-2xl border border-white/5 p-5 transition-all hover:border-accent/30 glass-card"
                    >
                        {(() => {
                            const entityTypeLabel = getActivityEntityLabel(entry.entity_type);
                            const showEntityName = normalizeActivityLabel(entry.entity_name) !== normalizeActivityLabel(entityTypeLabel);

                            return (
                        <div className="flex items-start gap-4">
                            <div className={`shrink-0 rounded-xl p-2 ${ACTION_COLORS[entry.action] || 'bg-white/10 text-slate-400'}`}>
                                {getActionIcon(entry.action)}
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="mb-1 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="font-semibold text-slate-200">{entry.actor_name}</span>
                                        <span className="text-slate-500">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                                        <span className="font-medium text-accent/80">{entityTypeLabel}</span>
                                        {showEntityName ? (
                                            <span className="truncate font-medium text-slate-200">{entry.entity_name}</span>
                                        ) : null}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                        <div
                                            className="flex items-center gap-1.5"
                                            title={formatDateTimeValue(entry.created_at, i18n.language)}
                                        >
                                            <Clock className="h-3 w-3" />
                                            {formatRelativeDateValue(entry.created_at, i18n.language)}
                                        </div>
                                    </div>
                                </div>
                                <p className="line-clamp-1 text-sm text-slate-400">{entry.description}</p>

                                {entry.changes && Object.keys(entry.changes).length > 0 && (
                                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {Object.entries(entry.changes).map(([field, delta]) => {
                                            const { old: oldValue, new: newValue } = getDiffPair(delta);
                                            return (
                                                <div
                                                    key={field}
                                                    className="rounded-lg border border-white/5 bg-black/30 p-2 text-[11px]"
                                                >
                                                    <div className="mb-1 font-bold uppercase tracking-wider text-slate-500">
                                                        {field.replace(/_/g, ' ')}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                                        <span
                                                            className="max-w-[80px] truncate line-through text-rose-400/80"
                                                            title={oldValue}
                                                        >
                                                            {oldValue}
                                                        </span>
                                                        <ArrowRight className="h-2.5 w-2.5 shrink-0 text-slate-600" />
                                                        <span className="truncate text-emerald-400" title={newValue}>
                                                            {newValue}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                            );
                        })()}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
