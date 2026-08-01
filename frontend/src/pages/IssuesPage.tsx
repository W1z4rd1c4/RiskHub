import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { RegisterListShell } from '@/components/ict-register/RegisterListShell';
import { ExportDialog } from '@/components/reports/ExportDialog';
import type { SupportedLanguage } from '@/i18n';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { IssueSummary } from '@/types/issue';

import { buildIssueColumns } from './issues/issueColumns';
import { ISSUE_REGISTER_CONFIG, type IssueRegisterView } from './issues/issueRegisterConfig';
import { IssuesFilterBar } from './issues/IssuesFilterBar';
import { formatIssueGroupLabel } from './issues/issuesPagePresentation';
import { useIssuesPageState } from './issues/useIssuesPageState';

export function IssuesPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['issues', 'common']);
    const language = i18n.language as SupportedLanguage;
    const state = useIssuesPageState(language);
    const columns = buildIssueColumns({ language, t });
    const views = ISSUE_REGISTER_CONFIG.views.filter((view) => view.value !== 'vendor' || resolveCapabilityFlag(state.capabilities, 'can_view_vendor_contexts'));

    return <RegisterListShell<IssueSummary, IssueRegisterView>
        accessDeniedState={<div className="glass-card p-8 flex items-center gap-3 text-amber-200"><AlertTriangle className="h-5 w-5" aria-hidden="true" /><span>{t('permissions.view_denied')}</span></div>}
        allView="all"
        title={t('title')}
        subtitle={t('page_subtitle')}
        views={views.map((view) => ({ value: view.value, label: t(view.labelKey) }))}
        view={state.viewMode}
        onViewChange={state.updateViewMode}
        canCreate={resolveCapabilityFlag(state.capabilities, 'can_create')}
        canExport={resolveCapabilityFlag(state.capabilities, 'can_export')}
        onCreate={() => void navigate('/issues/new')}
        createLabel={t('actions.new_issue')}
        exportLabel={t('common:actions.export')}
        exportDialog={({ isOpen, onClose }) => <ExportDialog
            isOpen={isOpen}
            onClose={onClose}
            onCurrentViewSubmit={async () => { await state.exportCurrentIssues(); onClose(); }}
            onSubmit={async (payload) => { await state.exportIssueSnapshot(payload); onClose(); }}
            isSubmitting={state.isExporting}
            dataTestId="issues-export-dialog"
            title={t('register.export.title')}
        />}
        isAccessDenied={state.isAccessDenied}
        isError={Boolean(state.errorKey)}
        errorMessage={state.errorKey ? t(state.errorKey) : undefined}
        isExporting={state.isExporting}
        isLoading={state.isLoading}
        items={state.items}
        columns={columns}
        table={{
            keyExtractor: (issue) => issue.id,
            onRowClick: (issue) => void navigate(`/issues/${issue.id}`),
            rowHref: (issue) => `/issues/${issue.id}`,
            rowLabel: (issue) => issue.title,
            sortKey: state.sortField,
            sortDirection: state.sortDirection,
            onSort: (key, direction) => state.updateSort(direction ? key : null, direction),
        }}
        currentPage={state.currentPage}
        totalPages={state.totalPages}
        totalCount={state.totalCount}
        itemsPerPage={state.limit}
        onPageChange={state.setCurrentPage}
        onRetry={() => void state.fetchIssues()}
        emptyMessage={state.hasLoadedOnce ? t('list.empty') : t('common:loading.data')}
        grouping={{
            groups: state.groups,
            onBack: state.clearSelectedGroup,
            onSelectGroup: state.selectGroup,
            selectedGroupLabel: state.selectedGroupLabel,
            selectedGroupValue: state.selectedGroupValue,
            hideActive: true,
            groupLabel: (group) => formatIssueGroupLabel(group, {
                unlinkedVendor: t('fallbacks.unlinked_vendor'),
                uncategorized: t('fallbacks.uncategorized'),
                unknownDepartment: t('fallbacks.unknown_department'),
                noProcess: t('fallbacks.no_process'),
                unknownRiskType: t('common:fallbacks.unknown_type'),
            }),
        }}
        testIdPrefix="issues"
        toolbar={<IssuesFilterBar facets={state.facets} filters={state.filters} isLoading={state.isLoading} onClearAll={state.clearFilters} onFilterChange={state.updateFilter} onRefresh={() => void state.fetchIssues()} onSearchChange={state.updateSearch} search={state.search} />}
    />;
}

export default IssuesPage;
