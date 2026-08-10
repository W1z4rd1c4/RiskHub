import { Building2, Shield, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { RegisterListShell } from '@/components/ict-register/RegisterListShell';
import { ExportDialog } from '@/components/reports/ExportDialog';
import type { SortDirection } from '@/components/tables';
import { usePendingApprovalIds } from '@/hooks/usePendingApprovalIds';
import { useLanguage, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { ControlSummary } from '@/types/control';

import { buildControlColumns } from './controls/controlColumns';
import { CONTROL_REGISTER_CONFIG, type ControlRegisterView } from './controls/controlRegisterConfig';
import { ControlRegisterFilterBar } from './controls/ControlRegisterFilterBar';
import { formatControlGroupLabel } from './controls/controlsPagePresentation';
import { useControlsPageState } from './controls/useControlsPageState';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';

export function ControlsPage() {
    const navigate = useNavigate();
    const { language } = useLanguage();
    const { t } = useTranslation('controls');
    const pendingApprovalIds = usePendingApprovalIds('control');
    const state = useControlsPageState(language);
    const columns = buildControlColumns({
        translate: t, pendingApprovalIds,
        onRestore: (controlId, event) => { event.stopPropagation(); void state.restoreControl(controlId); },
    });
    const views = CONTROL_REGISTER_CONFIG.views.filter((view) => view.value !== 'vendor' || resolveCapabilityFlag(state.capabilities, 'can_view_vendor_contexts'));

    return <RegisterListShell<ControlSummary, ControlRegisterView>
        accessDeniedState={<ReadAccessDeniedState />} allView="all" title={t('title')} subtitle={t('page_subtitle')}
        views={views.map((view) => ({ value: view.value, label: t(view.labelKey) }))}
        view={state.viewMode} onViewChange={state.updateViewMode}
        canCreate={resolveCapabilityFlag(state.capabilities, 'can_create')} canExport={resolveCapabilityFlag(state.capabilities, 'can_export')}
        onCreate={() => void navigate('/controls/new')} createLabel={t('new_control')} exportLabel={t('actions.export')}
        exportDialog={({ isOpen, onClose }) => <ExportDialog isOpen={isOpen} onClose={onClose}
            onCurrentViewSubmit={async () => { await state.exportCurrentControls(); onClose(); }}
            onSubmit={async (payload) => { await state.exportControlSnapshot(payload); onClose(); }}
            isSubmitting={state.isExporting} dataTestId="controls-export-dialog" title={t('register.export.title')} />}
        isAccessDenied={state.isAccessDenied} isError={Boolean(state.errorKey)} errorMessage={state.errorKey ? t(state.errorKey) : undefined}
        isExporting={state.isExporting} isLoading={state.isLoading} items={state.items} columns={columns}
        table={{ keyExtractor: (control) => control.id, onRowClick: (control) => void navigate(`/controls/${control.id}`), rowHref: (control) => `/controls/${control.id}`, rowLabel: (control) => control.name, sortKey: state.sortField, sortDirection: state.sortDirection, onSort: (key, direction) => state.updateSort(direction ? key : null, direction as SortDirection) }}
        currentPage={state.currentPage} totalPages={state.totalPages} totalCount={state.totalCount} itemsPerPage={state.limit}
        onPageChange={state.setCurrentPage} onRetry={() => void state.fetchControls()}
        emptyMessage={state.hasLoadedOnce ? t('empty_state.no_controls') : t('common:loading.data')}
        grouping={{
            groups: state.groups, onBack: state.clearSelectedGroup, onSelectGroup: state.selectGroup,
            selectedGroupLabel: state.selectedGroupLabel, selectedGroupValue: state.selectedGroupValue,
            hideActive: state.viewMode === 'risk', hideHighlighted: state.viewMode === 'risk',
            groupLabel: (group) => formatControlGroupLabel(group, {
                unlinkedVendor: t('grouping.unlinked_vendor'), uncategorized: t('form.labels.uncategorized'),
                unknownDepartment: t('common:fallbacks.unassigned'), noProcess: t('common:fallbacks.not_available'),
                unknownRiskType: t('common:fallbacks.unknown_type'), unknownRisk: t('common:fallbacks.unknown_risk'),
                controlForm: (value) => t(`form.${value}`, value),
            }),
            renderGroupBody: state.viewMode === 'risk' ? (group) => <div className="grid grid-cols-2 gap-y-2 pb-2 border-b border-white/5"><div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate"><Shield className="h-3 w-3 text-accent shrink-0" aria-hidden="true" /><span className="truncate">{String(group.meta?.risk_type || '') || t('common:fallbacks.unknown_type')}</span></div><div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate"><Building2 className="h-3 w-3 text-accent shrink-0" aria-hidden="true" /><span className="truncate">{String(group.meta?.risk_department_name || '') || t('common:fallbacks.unassigned')}</span></div><div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-widest truncate"><User className="h-3 w-3 text-accent shrink-0" aria-hidden="true" /><span className="truncate">{String(group.meta?.risk_owner_name || '') || t('common:fallbacks.no_owner')}</span></div></div> : undefined,
        }}
        testIdPrefix="controls"
        toolbar={<ControlRegisterFilterBar facets={state.facets} filters={state.filters} isLoading={state.isLoading} onClearAll={state.clearFilters} onFilterChange={state.updateFilter} onRefresh={() => void state.fetchControls()} onSearchChange={state.updateSearch} search={state.search} />}
    />;
}

export default ControlsPage;
