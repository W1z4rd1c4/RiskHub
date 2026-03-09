import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ExportDialog } from '@/components/reports/ExportDialog';
import { ViewSwitcher } from '@/components/tables';
import { useAuth } from '@/contexts/AuthContext';
import { RisksFilterBar } from './risks/RisksFilterBar';
import { RisksPageHeader } from './risks/RisksPageHeader';
import { RisksTableSection } from './risks/RisksTableSection';
import { parseRisksPageQueryParams } from './risks/risksPagePresentation';
import { useRisksPageState } from './risks/useRisksPageState';

export function RisksPage() {
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [initialState] = useState(() => parseRisksPageQueryParams(searchParams));
    const {
        criticalFilter,
        currentPage,
        errorKey,
        fetchRisks,
        handleExport,
        hasBreachFilter,
        hasLoadedOnce,
        isExportDialogOpen,
        isExporting,
        isLoading,
        items,
        limit,
        openExportDialog,
        closeExportDialog,
        priorityFilter,
        restoreRisk,
        search,
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

    return (
        <div className="space-y-8">
            <RisksPageHeader
                isExporting={isExporting}
                onCreateRisk={() => navigate('/risks/new')}
                onOpenExport={openExportDialog}
            />

            <ViewSwitcher
                value={viewMode}
                onChange={updateViewMode}
                exclude={hasPermission('vendors', 'read') ? ['risk', 'flag'] : ['risk', 'flag', 'vendor']}
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
                onPageChange={setCurrentPage}
                onRestoreRisk={restoreRisk}
                onRetry={fetchRisks}
                onRowClick={(risk) => navigate(`/risks/${risk.id}`)}
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
