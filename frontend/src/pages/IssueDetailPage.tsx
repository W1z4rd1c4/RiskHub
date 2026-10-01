import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { History, RefreshCw, Target, Wrench, type LucideIcon } from 'lucide-react';

import { issuePill, issueSeverityClass, issueStatusClass } from '@/components/issues/issueUi';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { TabList, TabPanel } from '@/components/ui/tabs';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { DetailLoadUnavailableState, DetailStaleWarning } from '@/pages/detail/DetailLoadState';
import { EntityDetailHeader } from '@/pages/detail/EntityDetailHeader';
import type { IssueSeverity, IssueStatus } from '@/types/issue';

import { IssueHistoryTab } from './issues/issue-detail/IssueHistoryTab';
import { IssueOverviewTab } from './issues/issue-detail/IssueOverviewTab';
import { IssueWorkflowTab } from './issues/issue-detail/IssueWorkflowTab';
import type { IssueDetailTab } from './issues/issue-detail/issueDetail.types';
import { useIssueDetail } from './issues/issue-detail/useIssueDetail';
import { useIssueHistory } from './issues/issue-detail/useIssueHistory';
import { resolveRegisterReturnTo } from './shared/registerReturnContext';
import { useContentTabQuery } from '@/hooks/useContentTabQuery';
import { LoadingState } from '@/components/ui/state';

const issueDetailTabs = ['overview', 'workflow', 'history'] as const;
const ISSUE_TABS_ID_PREFIX = 'issue-detail';

export function IssueDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/issues');
    const { t } = useTranslation('issues');

    const [activeTab, setActiveTab] = useContentTabQuery<IssueDetailTab>({
        tabs: issueDetailTabs,
        defaultTab: 'overview',
    });

    const { isRetrying, issue, issueId, loadOutcome, refreshIssue } = useIssueDetail({
        rawId: id,
    });
    const canViewActivityHistory = resolveCapabilityFlag(issue?.capabilities, 'can_view_activity_history');
    const { historyItems, isHistoryLoading, historyLoadFailed, isHistoryRefetching, refreshHistory } = useIssueHistory({
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

    const tabs: Array<{ id: IssueDetailTab; label: string; icon: LucideIcon }> = [
        { id: 'overview', label: t('detail.tabs.overview'), icon: Target },
        { id: 'workflow', label: t('detail.tabs.workflow'), icon: Wrench },
        { id: 'history', label: t('detail.tabs.history'), icon: History },
    ];

    if (loadOutcome === 'loading') {
        return (
            <LoadingState layout="page" label={t('detail.loading')} />
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
        <PageContainer>
            {loadOutcome === 'stale-with-error' ? (
                <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void refreshIssue()} />
            ) : null}
            <EntityDetailHeader
                back={{ label: t('actions.back_to_issues'), onClick: () => void navigate(returnTo) }}
                breadcrumbs={[{ label: t('navigation:sidebar.issues'), to: returnTo }, { label: issue.title }]}
                title={issue.title}
                statuses={(
                    <>
                        <span className={issuePill(issueStatusClass(issue.status))}>
                            {statusLabel(issue.status)}
                        </span>
                        <span className={issuePill(issueSeverityClass(issue.severity))}>
                            {severityLabel(issue.severity)}
                        </span>
                    </>
                )}
                description={formattedDescription}
                actions={(
                    <Button
                        variant="outline"
                        onClick={() => {
                            void refreshIssue();
                            if (activeTab === 'history') {
                                void refreshHistory();
                            }
                        }}
                    >
                        <RefreshCw aria-hidden="true" />
                        {t('actions.refresh')}
                    </Button>
                )}
            />

            <TabList
                tabs={tabs}
                activeTab={activeTab}
                onChange={setActiveTab}
                idPrefix={ISSUE_TABS_ID_PREFIX}
                ariaLabel={t('title')}
            />

            {issueDetailTabs.map((tab) => (
                <TabPanel key={tab} tab={tab} activeTab={activeTab} idPrefix={ISSUE_TABS_ID_PREFIX}>
                    {tab === 'overview' && activeTab === tab ? (
                        <IssueOverviewTab
                            issue={issue}
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
                            historyLoadFailed={historyLoadFailed}
                            isHistoryRefetching={isHistoryRefetching}
                            onRetryHistory={() => void refreshHistory()}
                            t={t}
                        />
                    ) : null}
                </TabPanel>
            ))}
        </PageContainer>
    );
}

export default IssueDetailPage;
