import { useNavigate } from 'react-router-dom';

import { RegisterListShell } from '@/components/ict-register/RegisterListShell';
import { ExportDialog } from '@/components/reports/ExportDialog';
import type { SortDirection } from '@/components/tables';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { CollectionGroup } from '@/types/collection';
import type { Vendor, VendorSortField } from '@/types/vendor';

import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';
import { SemanticFilterSummary } from './shared/SemanticFilterSummary';
import { parseVendorSemanticFilters } from './shared/ictRegisterSemanticFilters';
import { useIctRegisterSemanticPageState } from './shared/useIctRegisterPageState';
import { VendorRegisterFilterBar } from './vendors/VendorRegisterFilterBar';
import { buildVendorColumns } from './vendors/vendorColumns';
import { VENDOR_REGISTER_CONFIG, type VendorRegisterView } from './vendors/vendorRegisterConfig';
import { formatVendorGroupLabel } from './vendors/vendorsPagePresentation';
import { useVendorsPageState } from './vendors/useVendorsPageState';

export function VendorsPage() {
    const navigate = useNavigate();
    const { i18n, t } = useTranslation('vendors');
    const { semanticFilters, presentedSemanticFilters, removeSemanticFilter } =
        useIctRegisterSemanticPageState(parseVendorSemanticFilters);
    const state = useVendorsPageState(semanticFilters, i18n.language.startsWith('cs') ? 'cs' : 'en');
    const columns = buildVendorColumns({
        t,
        onRestore: (vendorId, event) => {
            event.stopPropagation();
            void state.restoreVendor(vendorId);
        },
    });
    const views = VENDOR_REGISTER_CONFIG.views.filter((view) => (
        view.value !== 'risk' || resolveCapabilityFlag(state.capabilities, 'can_view_risk_contexts')
    ));
    const presentGroupLabel = (group: CollectionGroup) => formatVendorGroupLabel(group, {
        noProcess: t('grouping.no_process'),
        typeLabel: (value) => t(`type.${value}`, value),
        unassigned: t('labels.unassigned'),
        unlinkedRisk: t('grouping.unlinked_risk'),
        doraRelevant: t('flags.dora_relevant'),
        supportsCoreFunction: t('flags.supports_core_function'),
        significantVendor: t('flags.significant_vendor'),
        insignificantVendor: t('grouping.insignificant_vendor'),
    });

    return (
        <RegisterListShell<Vendor, VendorRegisterView>
            accessDeniedState={<ReadAccessDeniedState />}
            allView="all"
            title={t('title')}
            subtitle={t('subtitle')}
            views={views.map((view) => ({ value: view.value, label: t(view.labelKey) }))}
            view={state.viewMode}
            onViewChange={state.updateViewMode}
            canCreate={resolveCapabilityFlag(state.capabilities, 'can_create')}
            canExport={resolveCapabilityFlag(state.capabilities, 'can_export')}
            onCreate={() => void navigate('/vendors/new')}
            createLabel={t('actions.new')}
            exportLabel={t('actions.export')}
            exportDialog={({ isOpen, onClose }) => (
                <ExportDialog
                    isOpen={isOpen}
                    onClose={onClose}
                    onSubmit={async () => {
                        await state.exportVendors();
                        onClose();
                    }}
                    isSubmitting={state.isExporting}
                    dataTestId="vendors-export-dialog"
                    title={t('register.export.title')}
                />
            )}
            isAccessDenied={state.isAccessDenied}
            isError={Boolean(state.errorKey)}
            errorMessage={state.errorKey ? t(state.errorKey, { ns: 'errorKeys' }) : undefined}
            isExporting={state.isExporting}
            isLoading={state.isLoading}
            items={state.items}
            columns={columns}
            table={{
                keyExtractor: (vendor) => vendor.id,
                onRowClick: (vendor) => void navigate(`/vendors/${vendor.id}`),
                rowHref: (vendor) => `/vendors/${vendor.id}`,
                rowLabel: (vendor) => vendor.name,
                sortKey: state.sortField,
                sortDirection: state.sortDirection,
                onSort: (key, direction) => state.updateSort(
                    direction ? key as VendorSortField : null,
                    direction as SortDirection,
                ),
            }}
            currentPage={state.currentPage}
            totalPages={state.totalPages}
            totalCount={state.totalCount}
            itemsPerPage={state.limit}
            onPageChange={state.setCurrentPage}
            onRetry={() => void state.fetchVendors()}
            emptyMessage={state.hasLoadedOnce ? t('empty_state.no_vendors') : t('common:loading.data')}
            grouping={{
                groups: state.groups,
                onBack: state.clearSelectedGroup,
                onSelectGroup: state.selectGroup,
                selectedGroupLabel: state.selectedGroupLabel,
                selectedGroupValue: state.selectedGroupValue,
                hideActive: true,
                hideHighlighted: true,
                groupLabel: presentGroupLabel,
            }}
            testIdPrefix="vendors"
            toolbar={(
                <div className="space-y-4">
                    <SemanticFilterSummary
                        filters={presentedSemanticFilters}
                        onRemove={removeSemanticFilter}
                    />
                    <VendorRegisterFilterBar
                        facets={state.facets}
                        filters={state.filters}
                        isLoading={state.isLoading}
                        onClearAll={state.clearFilters}
                        onFilterChange={state.updateFilter}
                        onRefresh={() => void state.fetchVendors()}
                        onSearchChange={state.updateSearch}
                        search={state.search}
                    />
                </div>
            )}
        />
    );
}

export default VendorsPage;
