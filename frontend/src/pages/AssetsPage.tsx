import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Search } from 'lucide-react';

import { Pagination, SortableTable, type SortDirection } from '@/components/tables';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { Asset, AssetSortField } from '@/types/asset';

import { buildAssetColumns } from './assets/assetColumns';
import type { AssetArchiveFilter } from './assets/assetsPagePresentation';
import { useAssetsPageState } from './assets/useAssetsPageState';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';

export function AssetsPage() {
    const navigate = useNavigate();
    const { t } = useTranslation('assets');
    const {
        capabilities,
        currentPage,
        errorKey,
        fetchAssets,
        hasLoadedOnce,
        isAccessDenied,
        isLoading,
        items,
        limit,
        restoreAsset,
        search,
        setCurrentPage,
        sortDirection,
        sortField,
        statusFilter,
        totalCount,
        totalPages,
        updateSearch,
        updateSort,
        updateStatusFilter,
    } = useAssetsPageState();

    if (isAccessDenied) {
        return <ReadAccessDeniedState />;
    }

    const columns = buildAssetColumns({
        t,
        onRestore: (assetId, event) => {
            event.stopPropagation();
            void restoreAsset(assetId);
        },
        canRestoreAsset: (asset: Asset) =>
            resolveCapabilityFlag(asset.capabilities, 'can_restore'),
    });

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
                    <p className="text-slate-500 font-medium mt-1">{t('subtitle')}</p>
                </div>
                {resolveCapabilityFlag(capabilities, 'can_create') && (
                    <button
                        type="button"
                        onClick={() => navigate('/assets/new')}
                        data-testid="assets-create-button"
                        className="px-5 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-all flex items-center gap-2"
                    >
                        <Plus className="h-5 w-5" />
                        {t('actions.new')}
                    </button>
                )}
            </div>

            <div className="glass-card flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                    <input
                        data-testid="assets-search-input"
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
                        onValueChange={(value) => updateStatusFilter(value as AssetArchiveFilter)}
                        placeholder={t('filters.all_statuses')}
                        allowEmpty
                        emptyLabel={t('filters.all_statuses')}
                        triggerTestId="assets-status-filter-trigger"
                        contentTestId="assets-status-filter-content"
                        optionTestIdPrefix="assets-status-filter-option"
                        options={[
                            { value: 'active', label: t('status.active') },
                            { value: 'archived', label: t('status.archived') },
                        ]}
                    />
                    <button
                        type="button"
                        onClick={() => void fetchAssets()}
                        data-testid="assets-refresh-button"
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors"
                    >
                        <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="glass-card space-y-4">
                <SortableTable
                    data={items}
                    columns={columns}
                    keyExtractor={(asset) => asset.id}
                    onRowClick={(asset) => navigate(`/assets/${asset.id}`)}
                    rowHref={(asset) => `/assets/${asset.id}`}
                    rowLabel={(asset) => asset.name}
                    isLoading={isLoading}
                    isError={Boolean(errorKey)}
                    onRetry={() => void fetchAssets()}
                    errorMessage={errorKey ? t(errorKey) : undefined}
                    emptyMessage={hasLoadedOnce ? t('empty.no_assets') : undefined}
                    sortKey={sortField}
                    sortDirection={sortDirection}
                    onSort={(key, direction) =>
                        updateSort(direction ? (key as AssetSortField) : null, direction as SortDirection)
                    }
                />
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={totalCount}
                    itemsPerPage={limit}
                />
            </div>
        </div>
    );
}

export default AssetsPage;
