import { Download, Plus, RefreshCw, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { PermissionGate } from '@/components/PermissionGate';
import { ExportDialog } from '@/components/reports/ExportDialog';
import { ViewSwitcher } from '@/components/tables';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/hooks';
import { KRI_MONITORING_FILTER_VALUES } from '@/lib/monitoringStatus';

import { KRIsTableSection } from '@/pages/kris/KRIsTableSection';
import { useKrisPageState } from '@/pages/kris/useKrisPageState';

export function KRIsPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { t } = useTranslation('kris');
    const { hasPermission } = useAuth();

    const {
        currentPage,
        errorKey,
        fetchKris,
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
        restoreKri,
        search,
        selectedGroupLabel,
        selectedGroupValue,
        setCurrentPage,
        statusFilter,
        timelinessFilter,
        totalCount,
        totalPages,
        updateRouteFilters,
        updateSearch,
        updateViewMode,
        viewMode,
        selectGroup,
        clearSelectedGroup,
    } = useKrisPageState({
        searchParams,
        setSearchParams,
    });

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">{t('title')}</h2>
                    <p className="text-slate-500 font-medium tracking-tight">{t('page_subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={openExportDialog}
                        data-testid="kris-export-button"
                        disabled={isExporting}
                        className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-semibold"
                    >
                        <Download className="h-4 w-4" />
                        {t('actions.export')}
                    </button>
                    <button
                        onClick={() => void fetchKris()}
                        data-testid="kris-refresh-button"
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-accent hover:bg-accent/10 transition-colors"
                        title={t('common:actions.refresh')}
                        aria-label={t('common:actions.refresh')}
                    >
                        <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} aria-hidden="true" />
                    </button>
                    <PermissionGate resource="risks" action="write">
                        <button onClick={() => navigate('/kris/new')} data-testid="kris-create-button" className="btn-primary">
                            <Plus className="h-5 w-5" /> {t('new_kri')}
                        </button>
                    </PermissionGate>
                </div>
            </div>

            <ViewSwitcher
                value={viewMode}
                onChange={updateViewMode}
                exclude={['flag', ...(hasPermission('vendors', 'read') ? [] : ['vendor' as const])]}
            />

            <div className="glass-card flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                    <input
                        data-testid="kris-search-input"
                        type="text"
                        placeholder={t('filters.search_placeholder')}
                        value={search}
                        onChange={(event) => updateSearch(event.target.value)}
                        className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                    />
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                    <button
                        onClick={() => updateRouteFilters('all', 'due_soon')}
                        data-testid="kris-status-filter-due_soon"
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${timelinessFilter === 'due_soon'
                            ? 'bg-accent text-white shadow-lg shadow-accent/20'
                            : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                            }`}
                    >
                        {t('filters.due_soon')}
                    </button>
                    {(['all', ...KRI_MONITORING_FILTER_VALUES, 'archived'] as const).map((option) => (
                        <button
                            key={option}
                            onClick={() => updateRouteFilters(option, null)}
                            data-testid={`kris-status-filter-${option}`}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${statusFilter === option && !timelinessFilter
                                ? 'bg-accent text-white shadow-lg shadow-accent/20'
                                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            {option === 'all' || option === 'archived' ? t(`filters.${option}`) : t(`monitoring.${option}`)}
                        </button>
                    ))}
                    <button
                        onClick={() => {
                            updateSearch('');
                            updateRouteFilters('all', null);
                        }}
                        data-testid="kris-clear-filters-button"
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors"
                        aria-label={t('filters.clear')}
                    >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>

            <KRIsTableSection
                canRestoreKri={hasPermission('risks', 'delete')}
                currentPage={currentPage}
                errorKey={errorKey}
                groups={groups}
                hasLoadedOnce={hasLoadedOnce}
                isLoading={isLoading}
                items={items}
                itemsPerPage={limit}
                onBackFromGroup={clearSelectedGroup}
                onPageChange={setCurrentPage}
                onRestoreKri={restoreKri}
                onRetry={fetchKris}
                onRowClick={(kri) => navigate(`/kris/${kri.id}`)}
                onSelectGroup={selectGroup}
                selectedGroupLabel={selectedGroupLabel}
                selectedGroupValue={selectedGroupValue}
                totalCount={totalCount}
                totalPages={totalPages}
                viewMode={viewMode}
            />

            <ExportDialog
                isOpen={isExportDialogOpen}
                onClose={closeExportDialog}
                onSubmit={handleExport}
                isSubmitting={isExporting}
                dataTestId="kris-export-dialog"
            />
        </div>
    );
}

export default KRIsPage;
