import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { ExportDialog } from '@/components/reports/ExportDialog';
import { ViewSwitcher } from '@/components/tables';
import { usePermissions } from '@/hooks/usePermissions';
import { IssuesFilterBar } from './issues/IssuesFilterBar';
import { IssuesPageHeader } from './issues/IssuesPageHeader';
import { IssuesTableSection } from './issues/IssuesTableSection';
import { parseIssuesPageQueryParams } from './issues/issuesPagePresentation';
import { useIssuesPageState } from './issues/useIssuesPageState';

export function IssuesPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { hasPermission } = usePermissions();
    const { t } = useTranslation('issues');
    const canRead = hasPermission('issues', 'read');

    const [initialState] = useState(() => parseIssuesPageQueryParams(searchParams));
    const {
        currentPage,
        capabilities,
        errorKey,
        excludeActiveExceptions,
        fetchIssues,
        groups,
        handleExport,
        hasLoadedOnce,
        includeClosed,
        isExportDialogOpen,
        isExporting,
        isLoading,
        items,
        limit,
        openExportDialog,
        closeExportDialog,
        overdueOnly,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        severityFilter,
        sortDirection,
        sortField,
        statusFilter,
        totalCount,
        totalPages,
        updateExcludeActiveExceptions,
        updateIncludeClosed,
        updateOverdueOnly,
        updateSearch,
        updateSeverityFilter,
        updateSort,
        updateStatusFilter,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup,
    } = useIssuesPageState({
        canRead,
        initialState,
    });

    if (!canRead) {
        return (
            <div className="glass-card p-8 flex items-center gap-3 text-amber-200">
                <AlertTriangle className="h-5 w-5" />
                <span>{t('permissions.view_denied')}</span>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <IssuesPageHeader
                canCreateIssue={capabilities?.can_create === true}
                isExporting={isExporting}
                onCreateIssue={() => navigate('/issues/new')}
                onOpenExport={openExportDialog}
            />

            <ViewSwitcher
                value={viewMode}
                onChange={updateViewMode}
                exclude={capabilities?.can_view_vendor_contexts === true ? ['risk', 'flag'] : ['risk', 'flag', 'vendor']}
            />

            <IssuesFilterBar
                search={search}
                statusFilter={statusFilter}
                severityFilter={severityFilter}
                overdueOnly={overdueOnly}
                excludeActiveExceptions={excludeActiveExceptions}
                includeClosed={includeClosed}
                isLoading={isLoading}
                onRefresh={fetchIssues}
                onSearchChange={updateSearch}
                onStatusChange={updateStatusFilter}
                onSeverityChange={updateSeverityFilter}
                onOverdueOnlyChange={updateOverdueOnly}
                onExcludeActiveExceptionsChange={updateExcludeActiveExceptions}
                onIncludeClosedChange={updateIncludeClosed}
            />

            <IssuesTableSection
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                itemsPerPage={limit}
                items={items}
                groups={groups}
                selectedGroupLabel={selectedGroupLabel}
                selectedGroupValue={selectedGroupValue}
                errorKey={errorKey}
                hasLoadedOnce={hasLoadedOnce}
                isLoading={isLoading}
                onBackFromGroup={clearSelectedGroup}
                sortField={sortField}
                sortDirection={sortDirection}
                onRetry={fetchIssues}
                onRowClick={(issue) => navigate(`/issues/${issue.id}`)}
                onSelectGroup={selectGroup}
                onSortChange={updateSort}
                onPageChange={setCurrentPage}
                viewMode={viewMode}
            />

            <ExportDialog
                isOpen={isExportDialogOpen}
                onClose={closeExportDialog}
                onSubmit={handleExport}
                isSubmitting={isExporting}
            />
        </div>
    );
}

export default IssuesPage;
