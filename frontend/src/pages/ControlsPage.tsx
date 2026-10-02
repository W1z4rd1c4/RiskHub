import { useLocation, useNavigate } from 'react-router-dom';

import { RegisterListShell } from '@/components/ict-register/RegisterListShell';
import { RiskGroupMetaBody } from '@/components/risks/RiskGroupMetaBody';
import { ExportDialog } from '@/components/reports/ExportDialog';
import type { SortDirection } from '@/components/tables';
import { useLanguage, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { ControlSummary } from '@/types/control';

import { buildControlColumns } from './controls/controlColumns';
import { CONTROL_REGISTER_CONFIG, type ControlRegisterView } from './controls/controlRegisterConfig';
import { ControlRegisterFilterBar } from './controls/ControlRegisterFilterBar';
import { CONTROL_GROUP_UNKNOWN_RISK_TYPE, formatControlForm, formatControlGroupLabel } from './controls/controlsPagePresentation';
import { useControlsPageState } from './controls/useControlsPageState';
import { useRiskTypeLabel } from './risks/useRiskTypeLabel';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from './shared/registerReturnContext';

export function ControlsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const returnTo = resolveRegisterReturnTo(`${location.pathname}${location.search}${location.hash}`, '/controls');
    const { language } = useLanguage();
    const { t } = useTranslation(['controls', 'common']);
    const riskTypeLabel = useRiskTypeLabel();
    const state = useControlsPageState(language);
    const columns = buildControlColumns({
        translate: t,
        onRestore: (controlId, event) => { event.stopPropagation(); void state.restoreControl(controlId); },
    });
    const views = CONTROL_REGISTER_CONFIG.views.filter((view) => view.value !== 'vendor' || resolveCapabilityFlag(state.capabilities, 'can_view_vendor_contexts'));

    return <RegisterListShell<ControlSummary, ControlRegisterView>
        accessDeniedState={<ReadAccessDeniedState />} allView="all" title={t('title')} subtitle={t('page_subtitle')}
        views={views.map((view) => ({ value: view.value, label: t(view.labelKey) }))}
        view={state.viewMode} onViewChange={state.updateViewMode}
        canCreate={resolveCapabilityFlag(state.capabilities, 'can_create')} canExport={resolveCapabilityFlag(state.capabilities, 'can_export')}
        onCreate={() => void navigate(appendRegisterReturnTo('/controls/new', returnTo))} createLabel={t('new_control')} exportLabel={t('common:actions.export')}
        exportDialog={({ isOpen, onClose }) => <ExportDialog isOpen={isOpen} onClose={onClose}
            onCurrentViewSubmit={async () => { await state.exportCurrentControls(); onClose(); }}
            onSubmit={async (payload) => { await state.exportControlSnapshot(payload); onClose(); }}
            isSubmitting={state.isExporting} dataTestId="controls-export-dialog" title={t('register.export.title')} />}
        isAccessDenied={state.isAccessDenied} isError={Boolean(state.errorKey)} errorMessage={state.errorKey ? t(state.errorKey) : undefined}
        isExporting={state.isExporting} isLoading={state.isLoading} items={state.items} columns={columns}
        table={{ keyExtractor: (control) => control.id, onRowClick: (control) => void navigate(appendRegisterReturnTo(`/controls/${control.id}`, returnTo)), rowHref: (control) => appendRegisterReturnTo(`/controls/${control.id}`, returnTo), rowLabel: (control) => control.name, sortKey: state.sortField, sortDirection: state.sortDirection, onSort: (key, direction) => state.updateSort(direction ? key : null, direction as SortDirection) }}
        currentPage={state.currentPage} totalPages={state.totalPages} totalCount={state.totalCount} itemsPerPage={state.limit}
        onPageChange={state.setCurrentPage} onRetry={() => void state.fetchControls()}
        emptyMessage={t('empty_state.no_controls')}
        grouping={{
            groups: state.groups, onBack: state.clearSelectedGroup, onSelectGroup: state.selectGroup,
            selectedGroupLabel: state.selectedGroupLabel, selectedGroupValue: state.selectedGroupValue,
            hideActive: state.viewMode === 'risk', hideHighlighted: state.viewMode === 'risk',
            // Risk-type groups show the same translated display name as the Risk register.
            groupLabel: (group) => state.viewMode === 'risk_type' && group.value !== CONTROL_GROUP_UNKNOWN_RISK_TYPE
                ? riskTypeLabel(group.value, group.label)
                : formatControlGroupLabel(group, {
                    unlinkedVendor: t('grouping.unlinked_vendor'), uncategorized: t('common:fallbacks.uncategorized'),
                    unknownDepartment: t('common:fallbacks.unassigned'), noProcess: t('common:fallbacks.not_available'),
                    unknownRiskType: t('common:fallbacks.unknown_type'), unknownRisk: t('common:fallbacks.unknown_risk'),
                    controlForm: (value) => formatControlForm(value, t),
                }),
            renderGroupBody: state.viewMode === 'risk' ? (group) => <RiskGroupMetaBody group={group} /> : undefined,
        }}
        testIdPrefix="controls"
        toolbar={<ControlRegisterFilterBar facets={state.facets} filters={state.filters} isLoading={state.isLoading} onClearAll={state.clearFilters} onFilterChange={state.updateFilter} onRefresh={() => void state.fetchControls()} onSearchChange={state.updateSearch} search={state.search} />}
    />;
}

export default ControlsPage;
