import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, History, RefreshCw, Target, Wrench } from 'lucide-react';

import { issuePill, issueSeverityClass, issueStatusClass } from '@/components/issues/issueUi';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { DetailLoadUnavailableState, DetailStaleWarning } from '@/pages/detail/DetailLoadState';
import type { IssueSeverity, IssueStatus } from '@/types/issue';

import { IssueHistoryTab } from './issues/issue-detail/IssueHistoryTab';
import { IssueOverviewTab } from './issues/issue-detail/IssueOverviewTab';
import { IssueWorkflowTab } from './issues/issue-detail/IssueWorkflowTab';
import type { IssueDetailTab } from './issues/issue-detail/issueDetail.types';
import { useIssueDetail } from './issues/issue-detail/useIssueDetail';
import { useIssueHistory } from './issues/issue-detail/useIssueHistory';
import { resolveRegisterReturnTo } from './shared/registerReturnContext';
import { useContentTabQuery } from '@/hooks/useContentTabQuery';
import { useContentTabs } from '@/hooks/useContentTabs';

const issueDetailTabs = ['overview', 'workflow', 'history'] as const;

export function IssueDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/issues');
    const { t, i18n } = useTranslation('issues');

    const [activeTab, setActiveTab] = useContentTabQuery<IssueDetailTab>({
        tabs: issueDetailTabs,
        defaultTab: 'overview',
    });
    const { getPanelProps, getTabProps } = useContentTabs({
        tabs: issueDetailTabs,
        activeTab,
        onChange: setActiveTab,
        idPrefix: 'issue-detail',
    });

    const { isRetrying, issue, issueId, loadOutcome, refreshIssue } = useIssueDetail({
        rawId: id,
    });
    const canViewActivityHistory = resolveCapabilityFlag(issue?.capabilities, 'can_view_activity_history');
    const { historyItems, isHistoryLoading, refreshHistory } = useIssueHistory({
        activeTab,
        canViewActivityHistory,
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

    const tabs: Array<{ id: IssueDetailTab; label: string; icon: typeof Target }> = [
        { id: 'overview', label: t('detail.tabs.overview'), icon: Target },
        { id: 'workflow', label: t('detail.tabs.workflow'), icon: Wrench },
        { id: 'history', label: t('detail.tabs.history'), icon: History },
    ];

    if (loadOutcome === 'loading') {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">
                    {t('detail.loading')}
                </p>
            </div>
        );
    }

    if (loadOutcome === 'unavailable' || !issue) {
        return (
            <DetailLoadUnavailableState
                backLabel={t('actions.back_to_issues')}
                isRetrying={isRetrying}
                onBack={() => navigate(returnTo)}
                onRetry={issueId === null ? undefined : () => void refreshIssue()}
            />
        );
    }

    return (
        <div className="space-y-8">
            {loadOutcome === 'stale-with-error' ? (
                <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void refreshIssue()} />
            ) : null}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => navigate(returnTo)}
                        className="flex items-center gap-2 text-xs font-black text-muted-foreground hover:text-accent transition-colors uppercase tracking-widest"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        {t('actions.back_to_issues')}
                    </button>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-4xl font-black text-foreground tracking-tighter">{issue.title}</h2>
                        <span className={issuePill(issueStatusClass(issue.status))}>
                            {statusLabel(issue.status)}
                        </span>
                        <span className={issuePill(issueSeverityClass(issue.severity))}>
                            {severityLabel(issue.severity)}
                        </span>
                    </div>

                    <p className="text-muted-foreground font-medium max-w-3xl">{formattedDescription}</p>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        void refreshIssue();
                        if (activeTab === 'history') {
                            void refreshHistory();
                        }
                    }}
                    className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-accent/40 transition-colors"
                    title={t('actions.refresh')}
                    aria-label={t('actions.refresh')}
                >
                    <RefreshCw className="h-5 w-5" aria-hidden="true" />
                </button>
            </div>

            <div className="flex items-center gap-1 border-b border-white/10" role="tablist" aria-label={t('title')}>
                {tabs.map((tab, index) => {
                    const TabIcon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            {...getTabProps(tab.id, index)}
                            className={`inline-flex items-center gap-2 px-5 py-3 text-sm font-bold transition-colors ${
                                isActive ? 'text-accent-text border-b-2 border-accent' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <TabIcon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {issueDetailTabs.map((tab) => (
                <div key={tab} {...getPanelProps(tab)}>
                    {tab === 'overview' && activeTab === tab ? (
                        <IssueOverviewTab
                            issue={issue}
                            locale={i18n.language}
                            sourceLabel={sourceLabel}
                            t={t}
                        />
                    ) : null}
                    {tab === 'workflow' && activeTab === tab ? <IssueWorkflowTab issue={issue} /> : null}
                    {tab === 'history' && activeTab === tab ? (
                        <IssueHistoryTab
                            canViewActivityHistory={canViewActivityHistory}
                            historyItems={historyItems}
                            isHistoryLoading={isHistoryLoading}
                            locale={i18n.language}
                            t={t}
                        />
                    ) : null}
                </div>
            ))}
        </div>
    );
}

export default IssueDetailPage;
