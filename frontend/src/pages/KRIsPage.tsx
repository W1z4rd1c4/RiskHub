import { Building2, Shield, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { RegisterListShell } from '@/components/ict-register/RegisterListShell';
import { ExportDialog } from '@/components/reports/ExportDialog';
import type { SortDirection } from '@/components/tables';
import type { SupportedLanguage } from '@/i18n';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { KeyRiskIndicator } from '@/types/kri';

import { KriRegisterFilterBar } from './kris/KriRegisterFilterBar';
import { buildKriColumns } from './kris/kriColumns';
import { formatKriGroupLabel } from './kris/kriPagePresentation';
import { KRI_REGISTER_CONFIG, type KriRegisterView } from './kris/kriRegisterConfig';
import { useKrisPageState } from './kris/useKrisPageState';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';

export function KRIsPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['kris', 'common']);
    const language = i18n.language as SupportedLanguage;
    const state = useKrisPageState(language);
    const columns = buildKriColumns({
        language,
        t,
        onRestore: (kriId, event) => { event.stopPropagation(); void state.restoreKri(kriId); },
    });
    const views = KRI_REGISTER_CONFIG.views.filter((view) => view.value !== 'vendor' || resolveCapabilityFlag(state.capabilities, 'can_view_vendor_contexts'));

    return <RegisterListShell<KeyRiskIndicator, KriRegisterView>
        accessDeniedState={<ReadAccessDeniedState />}
        allView="all"
        title={t('title')}
        subtitle={t('page_subtitle')}
        views={views.map((view) => ({ value: view.value, label: t(view.labelKey) }))}
        view={state.viewMode}
        onViewChange={state.updateViewMode}
        canCreate={resolveCapabilityFlag(state.capabilities, 'can_create')}
        canExport={resolveCapabilityFlag(state.capabilities, 'can_export')}
        onCreate={() => void navigate('/kris/new')}
        createLabel={t('new_kri')}
        exportLabel={t('actions.export')}
        exportDialog={({ isOpen, onClose }) => <ExportDialog
            isOpen={isOpen}
            onClose={onClose}
            onCurrentViewSubmit={async () => { await state.exportCurrentKris(); onClose(); }}
            onSubmit={async (payload) => { await state.exportKriSnapshot(payload); onClose(); }}
            isSubmitting={state.isExporting}
            dataTestId="kris-export-dialog"
            title={t('register.export.title')}
        />}
        isAccessDenied={state.isAccessDenied}
        isError={Boolean(state.errorKey)}
        errorMessage={state.errorKey ? t(state.errorKey) : undefined}
        isExporting={state.isExporting}
        isLoading={state.isLoading}
        items={state.items}
        columns={columns}
        table={{
            keyExtractor: (kri) => kri.id,
            onRowClick: (kri) => void navigate(`/kris/${kri.id}`),
            rowHref: (kri) => `/kris/${kri.id}`,
            rowLabel: (kri) => kri.metric_name,
            sortKey: state.sortField,
            sortDirection: state.sortDirection,
            onSort: (key, direction) => state.updateSort(direction ? key : null, direction as SortDirection),
        }}
        currentPage={state.currentPage}
        totalPages={state.totalPages}
        totalCount={state.totalCount}
        itemsPerPage={state.limit}
        onPageChange={state.setCurrentPage}
        onRetry={() => void state.fetchKris()}
        emptyMessage={state.hasLoadedOnce ? t('empty_state.no_kris') : t('common:loading.data')}
        grouping={{
            groups: state.groups,
            onBack: state.clearSelectedGroup,
            onSelectGroup: state.selectGroup,
            selectedGroupLabel: state.selectedGroupLabel,
            selectedGroupValue: state.selectedGroupValue,
            groupLabel: (group) => formatKriGroupLabel(group, {
                unlinkedVendor: t('grouping.unlinked_vendor'),
                uncategorized: t('common:fallbacks.not_available'),
                unknownDepartment: t('common:fallbacks.unassigned'),
                noProcess: t('common:fallbacks.not_available'),
                unknownRiskType: t('common:fallbacks.unknown_type'),
                unknownRisk: t('common:fallbacks.unknown_risk'),
            }),
            renderGroupBody: state.viewMode === 'risk' ? (group) => <div className="grid grid-cols-2 gap-y-2 pb-2 border-b border-white/5">
                <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate"><Shield className="h-3 w-3 text-accent shrink-0" aria-hidden="true" /><span className="truncate">{String(group.meta?.risk_type || '') || t('common:fallbacks.unknown_type')}</span></div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate"><Building2 className="h-3 w-3 text-accent shrink-0" aria-hidden="true" /><span className="truncate">{String(group.meta?.risk_department_name || '') || t('common:fallbacks.unassigned')}</span></div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate"><User className="h-3 w-3 text-accent shrink-0" aria-hidden="true" /><span className="truncate">{String(group.meta?.risk_owner_name || '') || t('common:fallbacks.no_owner')}</span></div>
            </div> : undefined,
        }}
        testIdPrefix="kris"
        toolbar={<KriRegisterFilterBar facets={state.facets} filters={state.filters} isLoading={state.isLoading} onClearAll={state.clearFilters} onFilterChange={state.updateFilter} onRefresh={() => void state.fetchKris()} onSearchChange={state.updateSearch} search={state.search} />}
    />;
}

export default KRIsPage;
