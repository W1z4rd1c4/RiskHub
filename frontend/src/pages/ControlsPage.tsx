import { useNavigate } from 'react-router-dom';
import { ExportDialog } from '@/components/reports/ExportDialog';
import { ViewSwitcher } from '@/components/tables';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { ControlsFilterBar } from './controls/ControlsFilterBar';
import { ControlsPageHeader } from './controls/ControlsPageHeader';
import { ControlsTableSection } from './controls/ControlsTableSection';
import { useControlsPageState } from './controls/useControlsPageState';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';

export function ControlsPage() {
    const navigate = useNavigate();
    const {
        capabilities,
        currentPage,
        errorKey,
        fetchControls,
        groups,
        handleExport,
        hasLoadedOnce,
        isExportDialogOpen,
        isExporting,
        isAccessDenied,
        isLoading,
        items,
        limit,
        openExportDialog,
        closeExportDialog,
        restoreControl,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        statusFilter,
        totalCount,
        totalPages,
        updateSearch,
        updateStatusFilter,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup,
    } = useControlsPageState();

    if (isAccessDenied) {
        return <ReadAccessDeniedState />;
    }

    return (
        <div className="space-y-8">
            <ControlsPageHeader
                canCreateControl={resolveCapabilityFlag(capabilities, 'can_create')}
                canExport={resolveCapabilityFlag(capabilities, 'can_export')}
                isExporting={isExporting}
                onCreateControl={() => navigate('/controls/new')}
                onOpenExport={openExportDialog}
            />

            <ViewSwitcher
                value={viewMode}
                onChange={updateViewMode}
                exclude={resolveCapabilityFlag(capabilities, 'can_view_vendor_contexts') ? ['flag'] : ['flag', 'vendor']}
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
                groups={groups}
                selectedGroupLabel={selectedGroupLabel}
                selectedGroupValue={selectedGroupValue}
                onBackFromGroup={clearSelectedGroup}
                onPageChange={setCurrentPage}
                onRestoreControl={restoreControl}
                onRetry={fetchControls}
                onRowClick={(control) => navigate(`/controls/${control.id}`)}
                onSelectGroup={selectGroup}
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

export default ControlsPage;
