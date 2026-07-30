import { useNavigate } from 'react-router-dom';

import { RegisterListShell } from '@/components/ict-register/RegisterListShell';
import { ExportDialog } from '@/components/reports/ExportDialog';
import type { SortDirection } from '@/components/tables';
import { useLanguage, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { Asset, AssetSortField } from '@/types/asset';

import { buildAssetColumns } from './assets/assetColumns';
import { AssetRegisterFilterBar } from './assets/AssetRegisterFilterBar';
import { ASSET_REGISTER_CONFIG, type AssetRegisterView } from './assets/assetRegisterConfig';
import { assetsEmptyStateKey } from './assets/assetsPagePresentation';
import { useAssetsPageState } from './assets/useAssetsPageState';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';
import { SemanticFilterSummary } from './shared/SemanticFilterSummary';
import { parseAssetSemanticFilters } from './shared/ictRegisterSemanticFilters';
import { useIctRegisterSemanticPageState } from './shared/useIctRegisterPageState';

export function AssetsPage() {
    const navigate = useNavigate();
    const { language } = useLanguage();
    const { semanticFilters, presentedSemanticFilters, removeSemanticFilter } = useIctRegisterSemanticPageState(parseAssetSemanticFilters);
    const { t } = useTranslation('assets');
    const state = useAssetsPageState(semanticFilters, language);
    const columns = buildAssetColumns({
        t,
        onRestore: (assetId, event) => { event.stopPropagation(); void state.restoreAsset(assetId); },
        canRestoreAsset: (asset: Asset) => resolveCapabilityFlag(asset.capabilities, 'can_restore'),
    });

    return <RegisterListShell<Asset, AssetRegisterView>
        accessDeniedState={<ReadAccessDeniedState />}
        allView="all" title={t('title')} subtitle={t('subtitle')}
        views={ASSET_REGISTER_CONFIG.views.map((view) => ({ value: view.value, label: t(view.labelKey) }))}
        view={state.viewMode} onViewChange={state.updateViewMode}
        canCreate={resolveCapabilityFlag(state.capabilities, 'can_create')}
        canExport={resolveCapabilityFlag(state.capabilities, 'can_export')}
        onCreate={() => void navigate('/assets/new')} createLabel={t('actions.new')} exportLabel={t('actions.export')}
        exportDialog={({ isOpen, onClose }) => <ExportDialog isOpen={isOpen} onClose={onClose}
            onSubmit={async () => { await state.exportAssets(); onClose(); }} isSubmitting={state.isExporting}
            dataTestId="assets-export-dialog" title={t('register.export.title')} />}
        isAccessDenied={state.isAccessDenied} isError={Boolean(state.errorKey)}
        errorMessage={state.errorKey ? t(state.errorKey) : undefined} isExporting={state.isExporting}
        isLoading={state.isLoading} items={state.items} columns={columns}
        table={{
            keyExtractor: (asset) => asset.id, onRowClick: (asset) => void navigate(`/assets/${asset.id}`),
            rowHref: (asset) => `/assets/${asset.id}`, rowLabel: (asset) => asset.name,
            sortKey: state.sortField, sortDirection: state.sortDirection,
            onSort: (key, direction) => state.updateSort(direction ? key as AssetSortField : null, direction as SortDirection),
        }}
        currentPage={state.currentPage} totalPages={state.totalPages} totalCount={state.totalCount}
        itemsPerPage={state.limit} onPageChange={state.setCurrentPage} onRetry={() => void state.fetchAssets()}
        emptyMessage={state.hasLoadedOnce ? t(assetsEmptyStateKey(state.search.trim().length > 0)) : t('common:loading.data')}
        grouping={{
            groups: state.groups, onBack: state.clearSelectedGroup, onSelectGroup: state.selectGroup,
            selectedGroupLabel: state.selectedGroupLabel, selectedGroupValue: state.selectedGroupValue,
            hideActive: true, hideHighlighted: true,
            groupLabel: (group) => {
                if (group.value.startsWith('criticality:')) return t(`values.preliminary_criticality.${group.value.slice('criticality:'.length)}`, t('values.unknown'));
                if (group.value.startsWith('type:')) return t(`values.asset_type.${group.value.slice('type:'.length)}`, t('values.unknown'));
                if (group.value === '__unassigned__') return t('register.groups.unassigned');
                if (group.value === '__unclassified__') return t('register.groups.unclassified');
                if (group.value === '__unlinked_process__') return t('register.groups.no_linked_process');
                if (group.value === '__unlinked_vendor__') return t('register.groups.no_linked_vendor');
                return group.label;
            },
        }}
        testIdPrefix="assets"
        toolbar={<div className="space-y-4">
            <SemanticFilterSummary filters={presentedSemanticFilters} onRemove={removeSemanticFilter} />
            <AssetRegisterFilterBar facets={state.facets} filters={state.filters} isLifecycleLocked={semanticFilters.committee_scope === true} isLoading={state.isLoading}
                onClearAll={state.clearFilters} onFilterChange={state.updateFilter} onRefresh={() => void state.fetchAssets()}
                onSearchChange={state.updateSearch} search={state.search} />
        </div>}
    />;
}

export default AssetsPage;
