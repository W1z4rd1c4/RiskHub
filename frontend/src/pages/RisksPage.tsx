import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ExportDialog } from '@/components/reports/ExportDialog';
import { ViewSwitcher } from '@/components/tables';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { RisksFilterBar } from './risks/RisksFilterBar';
import { RisksPageHeader } from './risks/RisksPageHeader';
import { RisksTableSection } from './risks/RisksTableSection';
import { parseRisksPageQueryParams } from './risks/risksPagePresentation';
import { useRisksPageState } from './risks/useRisksPageState';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';

export function RisksPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [initialState] = useState(() => parseRisksPageQueryParams(searchParams));
    const {
        criticalFilter,
        capabilities,
        currentPage,
        errorKey,
        fetchRisks,
        groups,
        handleExport,
        hasBreachFilter,
        hasLoadedOnce,
        isExportDialogOpen,
        isExporting,
        isAccessDenied,
        isLoading,
        items,
        limit,
        openExportDialog,
        closeExportDialog,
        priorityFilter,
        restoreRisk,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        sortDirection,
        sortField,
        statusFilter,
        totalCount,
        totalPages,
        typeFilter,
        updateCriticalFilter,
        updateHasBreachFilter,
        updateSearch,
        updateSort,
        updateStatusFilter,
        updateTypeFilter,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup,
        togglePriorityFilter,
    } = useRisksPageState({
        initialState,
    });

    const clearCriticalFilter = () => {
        updateCriticalFilter(false);
        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.delete('critical');
        setSearchParams(nextSearchParams);
    };

    const clearHasBreachFilter = () => {
        updateHasBreachFilter(undefined);
        updateCriticalFilter(false);
        setSearchParams({});
    };

    if (isAccessDenied) {
        return <ReadAccessDeniedState />;
    }

    return (
        <div className="space-y-8">
            <RisksPageHeader
                canCreateRisk={resolveCapabilityFlag(capabilities, 'can_create')}
                canExport={resolveCapabilityFlag(capabilities, 'can_export')}
                isExporting={isExporting}
                onCreateRisk={() => navigate('/risks/new')}
                onOpenExport={openExportDialog}
            />

            <ViewSwitcher
                value={viewMode}
                onChange={updateViewMode}
                exclude={resolveCapabilityFlag(capabilities, 'can_view_vendor_contexts') ? ['risk', 'flag', 'type'] : ['risk', 'flag', 'vendor', 'type']}
            />

            <RisksFilterBar
                criticalFilter={criticalFilter}
                hasBreachFilter={hasBreachFilter}
                isLoading={isLoading}
                onClearCriticalFilter={clearCriticalFilter}
                onClearHasBreachFilter={clearHasBreachFilter}
                onRefresh={fetchRisks}
                onSearchChange={updateSearch}
                onStatusChange={updateStatusFilter}
                onTogglePriorityFilter={togglePriorityFilter}
                onTypeChange={updateTypeFilter}
                priorityFilter={priorityFilter}
                search={search}
                statusFilter={statusFilter}
                typeFilter={typeFilter}
            />

            <RisksTableSection
                currentPage={currentPage}
                errorKey={errorKey}
                hasLoadedOnce={hasLoadedOnce}
                isLoading={isLoading}
                items={items}
                itemsPerPage={limit}
                groups={groups}
                selectedGroupLabel={selectedGroupLabel}
                selectedGroupValue={selectedGroupValue}
                onBackFromGroup={clearSelectedGroup}
                onPageChange={setCurrentPage}
                onRestoreRisk={restoreRisk}
                onRetry={fetchRisks}
                onRowClick={(risk) => navigate(`/risks/${risk.id}`)}
                onSelectGroup={selectGroup}
                onSortChange={updateSort}
                sortDirection={sortDirection}
                sortField={sortField}
                totalCount={totalCount}
                totalPages={totalPages}
                viewMode={viewMode}
            />

            <ExportDialog
                isOpen={isExportDialogOpen}
                onClose={closeExportDialog}
                onSubmit={handleExport}
                isSubmitting={isExporting}
                dataTestId="risks-export-dialog"
            />
        </div>
    );
}

export default RisksPage;
