import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity,
    Archive,
    ArrowRight,
    CheckCircle2,
    Clock,
    Edit2,
    Link as LinkIcon,
    Plus,
    RefreshCw,
    Unlink,
    XCircle,
} from 'lucide-react';

import { AccessDeniedState, EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/state';
import { useFormat, useTranslation } from '@/i18n/hooks';
import type { ActivityLogEntry } from '@/types/activityLog';
import { ACTION_COLORS } from '@/types/activityLog';
import { translateCode } from '@/lib/humanizeCode';
import type { CollectionOutcome } from '@/pages/shared/collectionPageState';

import { getDiffPair, titleCaseCode } from './activityLogPresentation';

interface ActivityLogEntriesProps {
    entries: ActivityLogEntry[];
    outcome: CollectionOutcome;
    needsRiskSelection?: boolean;
    onRetry: () => void;
}

const getActionIcon = (action: string) => {
    switch (action) {
        case 'create':
            return <Plus aria-hidden="true" className="h-3 w-3" />;
        case 'update':
            return <Edit2 aria-hidden="true" className="h-3 w-3" />;
        case 'delete':
            return <XCircle aria-hidden="true" className="h-3 w-3" />;
        case 'archive':
            return <Archive aria-hidden="true" className="h-3 w-3" />;
        case 'approve':
            return <CheckCircle2 aria-hidden="true" className="h-3 w-3" />;
        case 'reject':
            return <XCircle aria-hidden="true" className="h-3 w-3" />;
        case 'link':
            return <LinkIcon aria-hidden="true" className="h-3 w-3" />;
        case 'unlink':
            return <Unlink aria-hidden="true" className="h-3 w-3" />;
        case 'status_change':
            return <RefreshCw aria-hidden="true" className="h-3 w-3" />;
        default:
            return <Activity aria-hidden="true" className="h-3 w-3" />;
    }
};

const normalizeActivityLabel = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export function ActivityLogEntries({ entries, outcome, needsRiskSelection = false, onRetry }: ActivityLogEntriesProps) {
    const { t } = useTranslation('common');
    const format = useFormat();

    if (outcome.kind === 'initial-loading') {
        return (
            <LoadingState
                layout="section"
                label={t('loading.activity_log')}
                skeleton={(
                    <div className="flex flex-col gap-3">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <Skeleton key={index} className="h-24 w-full rounded-2xl border border-border" />
                        ))}
                    </div>
                )}
            />
        );
    }

    if (outcome.kind === 'denied') {
        // A refresh can be denied after rows were shown, so the replacement is announced.
        return <AccessDeniedState layout="section" descriptionKey="access.denied_activity_log" live />;
    }

    const isStale = outcome.kind === 'stale-with-error';
    const isLoadFailure = outcome.kind === 'fatal-error' || isStale;
    const isRetrying = isLoadFailure ? outcome.isRetrying : false;
    const errorState = isLoadFailure ? (
        <>
            <ErrorState
                layout="section"
                variant={isStale ? 'banner' : 'block'}
                title={isStale ? undefined : t('activity_log.failed_to_load')}
                message={t(isStale ? 'activity_log.may_be_out_of_date' : 'activity_log.failed_to_load_help')}
                onRetry={onRetry}
                isRetrying={isRetrying}
            />
            {isRetrying ? (
                <span role="status" className="sr-only">{t('activity_log.retrying')}</span>
            ) : null}
        </>
    ) : null;

    if (outcome.kind === 'fatal-error') {
        return errorState;
    }

    if (outcome.kind === 'empty') {
        return (
            <EmptyState
                layout="section"
                kind={needsRiskSelection ? 'no-data' : 'no-results'}
                icon={Activity}
                title={needsRiskSelection ? t('activity_log.select_risk') : t('empty.no_activity_logs')}
                description={needsRiskSelection ? t('activity_log.select_risk_hint') : t('activity_log.try_adjusting_filters')}
            />
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {errorState}
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
                        className="relative overflow-hidden rounded-2xl border border-border p-5 glass-card"
                    >
                        {(() => {
                            const entityTypeLabel = t(`activity_log.entity_types.${entry.entity_type}`, {
                                defaultValue: titleCaseCode(entry.entity_type),
                            });
                            const showEntityName = normalizeActivityLabel(entry.entity_name) !== normalizeActivityLabel(entityTypeLabel);

                            return (
                        <div className="flex items-start gap-4">
                            <div className={`shrink-0 rounded-xl p-2 ${ACTION_COLORS[entry.action] || 'bg-tint/10 text-muted-foreground'}`}>
                                {getActionIcon(entry.action)}
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                                        <span className="font-semibold text-foreground">{entry.actor_name}</span>
                                        <span className="text-muted-foreground">{translateCode(t, 'admin:audit.events', entry.action)}</span>
                                        <span className="font-medium text-accent-text">{entityTypeLabel}</span>
                                        {showEntityName ? (
                                            <span className="truncate font-medium text-foreground">{entry.entity_name}</span>
                                        ) : null}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        <div
                                            className="flex items-center gap-1.5"
                                            title={format.dateTime(entry.created_at)}
                                        >
                                            <Clock aria-hidden="true" className="h-3 w-3" />
                                            {format.relative(entry.created_at)}
                                        </div>
                                    </div>
                                </div>
                                <p className="line-clamp-1 text-sm text-muted-foreground">{entry.description}</p>

                                {entry.changes && Object.keys(entry.changes).length > 0 && (
                                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {Object.entries(entry.changes).map(([field, delta]) => {
                                            const { old: oldValue, new: newValue } = getDiffPair(delta, t('activity_log.empty_value'));
                                            return (
                                                <div
                                                    key={field}
                                                    className="rounded-lg border border-border bg-muted p-2 text-xs"
                                                >
                                                    <div className="mb-1 font-bold uppercase tracking-wider text-muted-foreground">
                                                        {translateCode(t, 'activity_log.fields', field)}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                                        <span
                                                            className="max-w-[80px] truncate line-through text-destructive"
                                                            title={oldValue}
                                                        >
                                                            {oldValue}
                                                        </span>
                                                        <ArrowRight aria-hidden="true" className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                                                        <span className="truncate text-success-text" title={newValue}>
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
