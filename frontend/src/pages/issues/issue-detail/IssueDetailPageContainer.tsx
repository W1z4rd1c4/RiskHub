import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, History, RefreshCw, Target, Wrench } from 'lucide-react';

import { issuePill, issueSeverityClass, issueStatusClass } from '@/components/issues/issueUi';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/i18n/hooks';
import type { Issue, IssueSeverity, IssueStatus } from '@/types/issue';

import { IssueHistoryTab } from './IssueHistoryTab';
import { IssueOverviewTab } from './IssueOverviewTab';
import { IssueWorkflowTab } from './IssueWorkflowTab';
import type { IssueDetailTab } from './issueDetail.types';
import { useIssueDetail } from './useIssueDetail';
import { useIssueHistory } from './useIssueHistory';

export function IssueDetailPageContainer() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { hasPermission, canViewActivityLog } = usePermissions();
    const { t, i18n } = useTranslation('issues');

    const issueId = id ? Number(id) : Number.NaN;
    const canRead = hasPermission('issues', 'read');
    const canWrite = hasPermission('issues', 'write');
    const canApprove = hasPermission('issues', 'approve');
    const [activeTab, setActiveTab] = useState<IssueDetailTab>('overview');

    const { errorKey, fetchIssue, isLoading, issue, setIssue } = useIssueDetail({
        canRead,
        issueId,
    });
    const { historyItems, isHistoryLoading } = useIssueHistory({
        activeTab,
        canViewActivityLog,
        issue,
    });

    const statusLabel = useCallback(
        (status: IssueStatus): string => t(`status.${status}`, status.replaceAll('_', ' ')),
        [t],
    );
    const severityLabel = useCallback(
        (severity: IssueSeverity): string => t(`severity.${severity}`, severity),
        [t],
    );
    const sourceLabel = useCallback(
        (sourceType: string): string => {
            const key = sourceType as 'manual' | 'control_execution' | 'kri_breach' | 'audit';
            return t(`source.${key}`, sourceType.replaceAll('_', ' '));
        },
        [t],
    );
    const formattedDescription = useMemo(
        () => issue?.description || t('detail.messages.no_description'),
        [issue?.description, t],
    );

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

    if (isLoading && !issue) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">
                    {t('detail.loading')}
                </p>
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
                    <h3 className="text-xl font-bold text-white uppercase tracking-tight">
                        {t('detail.not_found_title')}
                    </h3>
                    <p className="text-slate-500 mt-2 font-medium">
                        {errorKey
                            ? errorKey.startsWith('errorKeys.')
                                ? t(errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                                : t(errorKey)
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
                        <span className={issuePill(issueStatusClass(issue.status))}>
                            {statusLabel(issue.status)}
                        </span>
                        <span className={issuePill(issueSeverityClass(issue.severity))}>
                            {severityLabel(issue.severity)}
                        </span>
                    </div>

                    <p className="text-slate-500 font-medium max-w-3xl">{formattedDescription}</p>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        void fetchIssue();
                    }}
                    className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-accent/40 transition-all"
                    title={t('actions.refresh')}
                    aria-label={t('actions.refresh')}
                >
                    <RefreshCw className="h-5 w-5" aria-hidden="true" />
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

            {activeTab === 'overview' ? (
                <IssueOverviewTab
                    issue={issue}
                    locale={i18n.language}
                    sourceLabel={sourceLabel}
                    t={t}
                />
            ) : null}

            {activeTab === 'workflow' ? (
                <IssueWorkflowTab
                    canApprove={canApprove}
                    canWrite={canWrite}
                    issue={issue}
                    onIssueUpdated={handleIssueUpdated}
                />
            ) : null}

            {activeTab === 'history' ? (
                <IssueHistoryTab
                    canViewActivityLog={canViewActivityLog}
                    historyItems={historyItems}
                    isHistoryLoading={isHistoryLoading}
                    locale={i18n.language}
                    t={t}
                />
            ) : null}
        </div>
    );
}
