import { useNavigate } from 'react-router-dom';
import { Download, Plus, RefreshCw, Search } from 'lucide-react';

import { PermissionGate } from '@/components/PermissionGate';
import { ExportDialog } from '@/components/reports/ExportDialog';
import { ViewSwitcher } from '@/components/tables';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/i18n/hooks';
import type { VendorStatus, VendorType } from '@/types/vendor';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

import { VendorsTableSection } from './vendors/VendorsTableSection';
import { useVendorsPageState } from './vendors/useVendorsPageState';

export function VendorsPage() {
    const navigate = useNavigate();
    const { t } = useTranslation('vendors');
    const { hasPermission } = usePermissions();
    const canReadRisks = hasPermission('risks', 'read');
    const {
        currentPage,
        errorKey,
        fetchVendors,
        groups,
        handleExport,
        hasLoadedOnce,
        isExportDialogOpen,
        isExporting,
        isLoading,
        items,
        limit,
        openExportDialog,
        closeExportDialog,
        restoreVendor,
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
        updateSearch,
        updateSort,
        updateStatusFilter,
        updateTypeFilter,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup,
    } = useVendorsPageState({ canReadRisks });

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
                    <p className="text-slate-500 font-medium mt-1">{t('subtitle')}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={openExportDialog}
                        data-testid="vendors-export-button"
                        disabled={isExporting}
                        className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-semibold"
                    >
                        <Download className="h-4 w-4" />
                        {t('actions.export')}
                    </button>
                    <PermissionGate resource="vendors" action="write">
                        <button
                            type="button"
                            onClick={() => navigate('/vendors/new')}
                            data-testid="vendors-create-button"
                            className="px-5 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-all flex items-center gap-2"
                        >
                            <Plus className="h-5 w-5" />
                            {t('actions.new')}
                        </button>
                    </PermissionGate>
                </div>
            </div>

            <ViewSwitcher
                value={viewMode}
                onChange={updateViewMode}
                exclude={canReadRisks ? ['category', 'risk_type', 'vendor'] : ['category', 'risk_type', 'risk', 'vendor']}
            />

            <div className="glass-card flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                    <input
                        data-testid="vendors-search-input"
                        type="text"
                        placeholder={t('filters.search_placeholder')}
                        value={search}
                        onChange={(event) => updateSearch(event.target.value)}
                        className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                    />
                </div>
                <div className="flex gap-4">
                    <ThemedSelect
                        value={statusFilter}
                        onValueChange={(value) => updateStatusFilter(value as VendorStatus | '')}
                        placeholder={t('filters.all_statuses')}
                        allowEmpty
                        emptyLabel={t('filters.all_statuses')}
                        triggerTestId="vendors-status-filter-trigger"
                        contentTestId="vendors-status-filter-content"
                        optionTestIdPrefix="vendors-status-filter-option"
                        options={[
                            { value: 'active', label: t('status.active') },
                            { value: 'inactive', label: t('status.inactive') },
                        ]}
                    />
                    <ThemedSelect
                        value={typeFilter}
                        onValueChange={(value) => updateTypeFilter(value as VendorType | '')}
                        placeholder={t('filters.all_types')}
                        allowEmpty
                        emptyLabel={t('filters.all_types')}
                        triggerTestId="vendors-type-filter-trigger"
                        contentTestId="vendors-type-filter-content"
                        optionTestIdPrefix="vendors-type-filter-option"
                        options={[
                            { value: 'ict', label: t('type.ict') },
                            { value: 'outsourcing', label: t('type.outsourcing') },
                            { value: 'professional_services', label: t('type.professional_services') },
                            { value: 'partner', label: t('type.partner') },
                            { value: 'other', label: t('type.other') },
                        ]}
                    />
                    <button
                        type="button"
                        onClick={() => void fetchVendors()}
                        data-testid="vendors-refresh-button"
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors"
                    >
                        <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
                    </button>
                </div>
            </div>

            <VendorsTableSection
                currentPage={currentPage}
                errorKey={errorKey}
                groups={groups}
                hasLoadedOnce={hasLoadedOnce}
                isLoading={isLoading}
                items={items}
                itemsPerPage={limit}
                onBackFromGroup={clearSelectedGroup}
                onPageChange={setCurrentPage}
                onRestoreVendor={(vendorId) => void restoreVendor(vendorId)}
                onRetry={() => void fetchVendors()}
                onRowClick={(vendor) => navigate(`/vendors/${vendor.id}`)}
                onSelectGroup={selectGroup}
                onSortChange={updateSort}
                selectedGroupLabel={selectedGroupLabel}
                selectedGroupValue={selectedGroupValue}
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
                dataTestId="vendors-export-dialog"
            />
        </div>
    );
}

export default VendorsPage;
