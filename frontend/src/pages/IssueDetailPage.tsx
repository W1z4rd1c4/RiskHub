import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, History, RefreshCw, Target, Wrench } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { RemediationPlanCard } from '@/components/issues/RemediationPlanCard';
import { issuePill, issueSeverityClass, issueStatusClass } from '@/components/issues/issueUi';
import { usePermissions } from '@/hooks/usePermissions';
import { activityLogApi } from '@/services/activityLogApi';
import { apiClient } from '@/services/apiClient';
import { issuesApi } from '@/services/issuesApi';
import type { ActivityLogEntry } from '@/types/activityLog';
import type { Issue, IssueSeverity, IssueStatus } from '@/types/issue';

type IssueDetailTab = 'overview' | 'workflow' | 'history';

function formatDateTime(value: string | null, locale: string, notSetLabel: string): string {
    if (!value) {
        return notSetLabel;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(parsed);
}

function exceptionActorName(
    requestedByName: string | null,
    approvedByName: string | null,
    unknownUserLabel: string
): string {
    if (approvedByName) {
        return approvedByName;
    }
    if (requestedByName) {
        return requestedByName;
    }
    return unknownUserLabel;
}

function MetaBlock({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
            <p className="text-sm text-slate-300 break-words">{value}</p>
        </div>
    );
}

export function IssueDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { hasPermission, canViewActivityLog } = usePermissions();
    const { t, i18n } = useTranslation('issues');

    const canRead = hasPermission('issues', 'read');
    const canWrite = hasPermission('issues', 'write');
    const canApprove = hasPermission('issues', 'approve');

    const [issue, setIssue] = useState<Issue | null>(null);
    const [activeTab, setActiveTab] = useState<IssueDetailTab>('overview');
    const [historyItems, setHistoryItems] = useState<ActivityLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const issueId = id ? Number(id) : Number.NaN;

    const statusLabel = useCallback(
        (status: IssueStatus): string => t(`status.${status}`, status.replaceAll('_', ' ')),
        [t]
    );

    const severityLabel = useCallback(
        (severity: IssueSeverity): string => t(`severity.${severity}`, severity),
        [t]
    );

    const sourceLabel = useCallback(
        (sourceType: string): string => {
            const key = sourceType as 'manual' | 'control_execution' | 'kri_breach' | 'audit';
            return t(`source.${key}`, sourceType.replaceAll('_', ' '));
        },
        [t]
    );

    const formattedDescription = useMemo(
        () => issue?.description || t('detail.messages.no_description'),
        [issue?.description, t]
    );

    const fetchIssue = useCallback(async () => {
        if (!Number.isFinite(issueId) || issueId <= 0) {
            setErrorKey('errors.not_found');
            setIssue(null);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const response = await issuesApi.get(issueId);
            setIssue(response);
            setErrorKey(null);
        } catch (loadError) {
            setErrorKey(apiClient.toUiMessageKey(loadError));
            setIssue(null);
        } finally {
            setIsLoading(false);
        }
    }, [issueId]);

    useEffect(() => {
        if (!canRead) {
            setIsLoading(false);
            return;
        }
        fetchIssue();
    }, [canRead, fetchIssue]);

    useEffect(() => {
        if (activeTab !== 'history' || !issue || !canViewActivityLog) {
            setHistoryItems((prev) => (prev.length === 0 ? prev : []));
            setIsHistoryLoading(false);
            return;
        }

        let cancelled = false;
        setIsHistoryLoading(true);
        activityLogApi
            .list({
                entity_type: 'issue',
                entity_id: issue.id,
                limit: 100,
            })
            .then((response) => {
                if (!cancelled) {
                    setHistoryItems(response.items);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setHistoryItems((prev) => (prev.length === 0 ? prev : []));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsHistoryLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [activeTab, canViewActivityLog, issue]);

    const handleIssueUpdated = (updatedIssue: Issue) => {
        setIssue(updatedIssue);
    };

    const tabs: Array<{ id: IssueDetailTab; label: string; icon: typeof Target }> = [
        { id: 'overview', label: t('detail.tabs.overview'), icon: Target },
        { id: 'workflow', label: t('detail.tabs.workflow'), icon: Wrench },
        { id: 'history', label: t('detail.tabs.history'), icon: History },
    ];

    if (!canRead) {
        return (
            <div className="glass-card p-8 flex items-center gap-3 text-amber-200">
                <AlertTriangle className="h-5 w-5" />
                <span>{t('permissions.view_denied')}</span>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">{t('detail.loading')}</p>
            </div>
        );
    }

    if (errorKey || !issue) {
        return (
            <div className="glass-card flex flex-col items-center justify-center p-20 text-center gap-4">
                <div className="bg-rose-500/20 p-4 rounded-full">
                    <AlertTriangle className="h-10 w-10 text-rose-500" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white uppercase tracking-tight">{t('detail.not_found_title')}</h3>
                    <p className="text-slate-500 mt-2 font-medium">
                        {errorKey
                            ? (errorKey.startsWith('errorKeys.')
                                ? t(errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                                : t(errorKey))
                            : t('errors.unable_to_load')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/issues')}
                    className="mt-4 px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-all flex items-center gap-2"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t('actions.back_to_issues')}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => navigate('/issues')}
                        className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-accent transition-colors uppercase tracking-widest"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        {t('actions.back_to_issues')}
                    </button>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-4xl font-black text-white tracking-tighter">{issue.title}</h2>
                        <span className={issuePill(issueStatusClass(issue.status))}>{statusLabel(issue.status)}</span>
                        <span className={issuePill(issueSeverityClass(issue.severity))}>{severityLabel(issue.severity)}</span>
                    </div>

                    <p className="text-slate-500 font-medium max-w-3xl">{formattedDescription}</p>
                </div>

                <button
                    type="button"
                    onClick={fetchIssue}
                    className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-accent/40 transition-all"
                    title={t('actions.refresh')}
                >
                    <RefreshCw className="h-5 w-5" />
                </button>
            </div>

            <div className="flex items-center gap-1 border-b border-white/10" role="tablist" aria-label={t('title')}>
                {tabs.map((tab) => {
                    const TabIcon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setActiveTab(tab.id)}
                            className={`inline-flex items-center gap-2 px-5 py-3 text-sm font-bold transition-all ${
                                isActive ? 'text-accent border-b-2 border-accent' : 'text-slate-500 hover:text-white'
                            }`}
                        >
                            <TabIcon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'overview' && (
                <section className="space-y-5" data-testid="issue-overview-panel">
                    <section className="glass-card p-6 space-y-4">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <MetaBlock label={t('detail.fields.source')} value={sourceLabel(issue.source_type)} />
                            <MetaBlock
                                label={t('detail.fields.owner')}
                                value={issue.owner_user_name || t('fallbacks.unassigned')}
                            />
                            <MetaBlock
                                label={t('detail.fields.department')}
                                value={issue.department_name || t('fallbacks.unknown_department')}
                            />
                            <MetaBlock
                                label={t('detail.fields.opened')}
                                value={formatDateTime(issue.opened_at, i18n.language, t('fallbacks.not_set'))}
                            />
                            <MetaBlock
                                label={t('detail.fields.due')}
                                value={formatDateTime(issue.due_at, i18n.language, t('fallbacks.not_set'))}
                            />
                            <MetaBlock
                                label={t('detail.fields.created_by')}
                                value={issue.created_by_name || t('fallbacks.unknown_user')}
                            />
                        </div>
                    </section>

                    <section className="glass-card p-6 space-y-5">
                        <div className="space-y-3">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('detail.sections.linked_entities')}</h3>
                            {issue.links.length === 0 ? (
                                <p className="text-sm text-slate-400">{t('detail.messages.no_linked_entities')}</p>
                            ) : (
                                <ul className="space-y-2">
                                    {issue.links.map((link) => (
                                        <li key={link.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                                            <p className="text-sm text-slate-300">
                                                {link.linked_entity_name ||
                                                    (link.linked_entity_type
                                                        ? t(`fallbacks.unknown_${link.linked_entity_type}`, `Unknown ${link.linked_entity_type}`)
                                                        : t('fallbacks.unknown_link'))}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('detail.sections.exceptions')}</h3>
                            {issue.exceptions.length === 0 ? (
                                <p className="text-sm text-slate-400">{t('detail.messages.no_exceptions')}</p>
                            ) : (
                                <ul className="space-y-2">
                                    {issue.exceptions
                                        .slice()
                                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                        .map((exception) => (
                                            <li key={exception.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 space-y-1.5">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="text-sm font-semibold text-slate-300">
                                                        {t(`exception_status.${exception.status}`, exception.status)}
                                                    </span>
                                                    <span className="text-xs text-slate-500">
                                                        {t('detail.messages.expires')}:{' '}
                                                        {formatDateTime(exception.expires_at, i18n.language, t('fallbacks.not_set'))}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-slate-300">{exception.reason}</p>
                                                <p className="text-xs text-slate-500">
                                                    {exceptionActorName(
                                                        exception.requested_by_name,
                                                        exception.approved_by_name,
                                                        t('fallbacks.unknown_user')
                                                    )}
                                                </p>
                                            </li>
                                        ))}
                                </ul>
                            )}
                        </div>
                    </section>
                </section>
            )}

            {activeTab === 'workflow' && (
                <section data-testid="issue-workflow-panel">
                    <RemediationPlanCard
                        issue={issue}
                        canWrite={canWrite}
                        canApprove={canApprove}
                        onIssueUpdated={handleIssueUpdated}
                    />
                </section>
            )}

            {activeTab === 'history' && (
                <section className="glass-card p-6 space-y-4" data-testid="issue-history-panel">
                    {!canViewActivityLog ? (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                            {t('permissions.history_denied')}
                        </div>
                    ) : isHistoryLoading ? (
                        <p className="text-sm text-slate-400">{t('detail.messages.loading_history')}</p>
                    ) : historyItems.length === 0 ? (
                        <p className="text-sm text-slate-400">{t('detail.messages.no_history')}</p>
                    ) : (
                        <ul className="space-y-2">
                            {historyItems.map((entry) => (
                                <li key={entry.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm font-semibold text-slate-300">{entry.action.replaceAll('_', ' ')}</p>
                                        <p className="text-xs text-slate-500">
                                            {formatDateTime(entry.created_at, i18n.language, t('fallbacks.not_set'))}
                                        </p>
                                    </div>
                                    <p className="text-sm text-slate-300 mt-1">{entry.description}</p>
                                    <p className="text-xs text-slate-500 mt-1">{entry.actor_name || t('detail.messages.system')}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </div>
    );
}
