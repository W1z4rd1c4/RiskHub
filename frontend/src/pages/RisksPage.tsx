import { useNavigate } from 'react-router-dom';

import { RegisterListShell } from '@/components/ict-register/RegisterListShell';
import { ExportDialog } from '@/components/reports/ExportDialog';
import type { SortDirection } from '@/components/tables';
import { usePendingApprovalIds } from '@/hooks/usePendingApprovalIds';
import { useRiskThresholds, useRiskTypes } from '@/hooks/useRiskHubConfig';
import { useLanguage, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { RiskSummary } from '@/types/risk';

import { buildRiskColumns } from './risks/riskColumns';
import { RiskRegisterFilterBar } from './risks/RiskRegisterFilterBar';
import { resolveRiskTypeDisplayName, RISK_REGISTER_CONFIG, type RiskRegisterView } from './risks/riskRegisterConfig';
import { formatRiskGroupLabel, RISK_GROUP_UNKNOWN_RISK_TYPE } from './risks/risksPagePresentation';
import { useRisksPageState } from './risks/useRisksPageState';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';
import { SemanticFilterSummary } from './shared/SemanticFilterSummary';
import { parseRiskSemanticFilters } from './shared/ictRegisterSemanticFilters';
import { useIctRegisterSemanticPageState } from './shared/useIctRegisterPageState';

export function RisksPage() {
    const navigate = useNavigate();
    const { language } = useLanguage();
    const { t } = useTranslation('risks');
    const pendingApprovalIds = usePendingApprovalIds('risk');
    const { getColor, getDisplayName, getInitials } = useRiskTypes();
    const { getScoreColor } = useRiskThresholds();
    const { semanticFilters, presentedSemanticFilters, removeSemanticFilter } = useIctRegisterSemanticPageState(parseRiskSemanticFilters);
    const state = useRisksPageState(semanticFilters, language);
    const columns = buildRiskColumns({
        t, pendingApprovalIds, getColor, getDisplayName, getInitials, getScoreColor,
        handleRestoreRisk: (riskId, event) => { event.stopPropagation(); void state.restoreRisk(riskId); },
    });
    const views = RISK_REGISTER_CONFIG.views.filter((view) => view.value !== 'vendor' || resolveCapabilityFlag(state.capabilities, 'can_view_vendor_contexts'));

    return <RegisterListShell<RiskSummary, RiskRegisterView>
        accessDeniedState={<ReadAccessDeniedState />} allView="all" title={t('title')} subtitle={t('page_subtitle')}
        views={views.map((view) => ({ value: view.value, label: t(view.labelKey) }))}
        view={state.viewMode} onViewChange={state.updateViewMode}
        canCreate={resolveCapabilityFlag(state.capabilities, 'can_create')} canExport={resolveCapabilityFlag(state.capabilities, 'can_export')}
        onCreate={() => void navigate('/risks/new')} createLabel={t('new_risk')} exportLabel={t('actions.export')}
        exportDialog={({ isOpen, onClose }) => <ExportDialog isOpen={isOpen} onClose={onClose}
            onCurrentViewSubmit={async () => { await state.exportCurrentRisks(); onClose(); }}
            onSubmit={async (payload) => { await state.exportRiskSnapshot(payload); onClose(); }}
            isSubmitting={state.isExporting} dataTestId="risks-export-dialog" title={t('register.export.title')} />}
        isAccessDenied={state.isAccessDenied} isError={Boolean(state.errorKey)} errorMessage={state.errorKey ? t(state.errorKey) : undefined}
        isExporting={state.isExporting} isLoading={state.isLoading} items={state.items} columns={columns}
        table={{ keyExtractor: (risk) => risk.id, onRowClick: (risk) => void navigate(`/risks/${risk.id}`), rowHref: (risk) => `/risks/${risk.id}`, rowLabel: (risk) => risk.name, sortKey: state.sortField, sortDirection: state.sortDirection, onSort: (key, direction) => state.updateSort(direction ? key : null, direction as SortDirection) }}
        currentPage={state.currentPage} totalPages={state.totalPages} totalCount={state.totalCount} itemsPerPage={state.limit}
        onPageChange={state.setCurrentPage} onRetry={() => void state.fetchRisks()}
        emptyMessage={state.hasLoadedOnce ? t('empty_state.no_risks') : t('common:loading.data')}
        grouping={{
            groups: state.groups, onBack: state.clearSelectedGroup, onSelectGroup: state.selectGroup,
            selectedGroupLabel: state.selectedGroupLabel, selectedGroupValue: state.selectedGroupValue,
            groupLabel: (group) => state.viewMode === 'risk_type' && group.value !== RISK_GROUP_UNKNOWN_RISK_TYPE
                ? resolveRiskTypeDisplayName(
                    group.value,
                    getDisplayName(group.value) || group.label,
                    (key, fallback) => t(key, fallback),
                )
                : formatRiskGroupLabel(group, {
                    unlinkedVendor: t('grouping.unlinked_vendor'), uncategorized: t('common:fallbacks.not_available'),
                    unknownDepartment: t('common:fallbacks.unassigned'), noProcess: t('common:fallbacks.not_available'),
                    unknownRiskType: t('common:fallbacks.unknown_type'),
                }),
        }}
        testIdPrefix="risks"
        toolbar={<div className="space-y-4"><SemanticFilterSummary filters={presentedSemanticFilters} onRemove={removeSemanticFilter} /><RiskRegisterFilterBar facets={state.facets} filters={state.filters} isPopulationLocked={semanticFilters.committee_scope === true} isLoading={state.isLoading} onClearAll={state.clearFilters} onFilterChange={state.updateFilter} onRefresh={() => void state.fetchRisks()} onSearchChange={state.updateSearch} search={state.search} /></div>}
    />;
}

export default RisksPage;
