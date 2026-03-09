import { useNavigate } from 'react-router-dom';
import { ExportDialog } from '@/components/reports/ExportDialog';
import { ViewSwitcher } from '@/components/tables';
import { useAuth } from '@/contexts/AuthContext';
import { ControlsFilterBar } from './controls/ControlsFilterBar';
import { ControlsPageHeader } from './controls/ControlsPageHeader';
import { ControlsTableSection } from './controls/ControlsTableSection';
import { useControlsPageState } from './controls/useControlsPageState';

export function ControlsPage() {
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const {
        currentPage,
        errorKey,
        fetchControls,
        handleExport,
        hasLoadedOnce,
        isExportDialogOpen,
        isExporting,
        isLoading,
        items,
        limit,
        openExportDialog,
        closeExportDialog,
        restoreControl,
        search,
        setCurrentPage,
        statusFilter,
        totalCount,
        totalPages,
        updateSearch,
        updateStatusFilter,
        updateViewMode,
        viewMode,
    } = useControlsPageState();

    return (
        <div className="space-y-8">
            <ControlsPageHeader
                isExporting={isExporting}
                onCreateControl={() => navigate('/controls/new')}
                onOpenExport={openExportDialog}
            />

            <ViewSwitcher
                value={viewMode}
                onChange={updateViewMode}
                exclude={hasPermission('vendors', 'read') ? ['flag'] : ['flag', 'vendor']}
            />

            <ControlsFilterBar
                search={search}
                statusFilter={statusFilter}
                isLoading={isLoading}
                onRefresh={fetchControls}
                onSearchChange={updateSearch}
                onStatusChange={updateStatusFilter}
            />

            <ControlsTableSection
                currentPage={currentPage}
                errorKey={errorKey}
                hasLoadedOnce={hasLoadedOnce}
                isLoading={isLoading}
                items={items}
                itemsPerPage={limit}
                onPageChange={setCurrentPage}
                onRestoreControl={restoreControl}
                onRetry={fetchControls}
                onRowClick={(control) => navigate(`/controls/${control.id}`)}
                totalCount={totalCount}
                totalPages={totalPages}
                viewMode={viewMode}
            />

            <ExportDialog
                isOpen={isExportDialogOpen}
                onClose={closeExportDialog}
                onSubmit={handleExport}
                isSubmitting={isExporting}
                dataTestId="controls-export-dialog"
            />
        </div>
    );
}
