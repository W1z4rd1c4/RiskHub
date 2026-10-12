import { useLocation, useNavigate } from 'react-router-dom';

import { RegisterListShell } from '@/components/ict-register/RegisterListShell';
import { RiskGroupMetaBody } from '@/components/risks/RiskGroupMetaBody';
import { ExportDialog } from '@/components/reports/ExportDialog';
import { useTranslation, useFormat } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { KeyRiskIndicator } from '@/types/kri';

import { KriRegisterFilterBar } from './kris/KriRegisterFilterBar';
import { buildKriColumns } from './kris/kriColumns';
import { formatKriGroupLabel, KRI_GROUP_UNKNOWN_RISK_TYPE } from './kris/kriPagePresentation';
import { KRI_REGISTER_CONFIG, type KriRegisterView } from './kris/kriRegisterConfig';
import { useKrisPageState } from './kris/useKrisPageState';
import { useRiskTypeLabel } from './risks/useRiskTypeLabel';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from './shared/registerReturnContext';

export function KRIsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const returnTo = resolveRegisterReturnTo(`${location.pathname}${location.search}${location.hash}`, '/kris');
    const { t } = useTranslation(['kris', 'common']);
    const riskTypeLabel = useRiskTypeLabel();
    // PG-35: one normalized UI language (the value LanguageProvider reports).
    const { locale: language } = useFormat();
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
        workingSet={state.workingSet}
        canCreate={resolveCapabilityFlag(state.capabilities, 'can_create')}
        canExport={resolveCapabilityFlag(state.capabilities, 'can_export')}
        onCreate={() => void navigate(appendRegisterReturnTo('/kris/new', returnTo))}
        createLabel={t('new_kri')}
        exportLabel={t('common:actions.export')}
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
            onRowClick: (kri) => void navigate(appendRegisterReturnTo(`/kris/${kri.id}`, returnTo)),
            rowHref: (kri) => appendRegisterReturnTo(`/kris/${kri.id}`, returnTo),
            rowLabel: (kri) => kri.metric_name,
        }}
        totalPages={state.totalPages}
        totalCount={state.totalCount}
        itemsPerPage={state.limit}
        onRetry={() => void state.fetchKris()}
        emptyMessage={t('empty_state.no_kris')}
        grouping={{
            groups: state.groups,
            selectedGroupLabel: state.selectedGroupLabel,
            // Risk-type groups show the same translated display name as the Risk register.
            groupLabel: (group) => state.workingSet.viewMode === 'risk_type' && group.value !== KRI_GROUP_UNKNOWN_RISK_TYPE
                ? riskTypeLabel(group.value, group.label)
                : formatKriGroupLabel(group, {
                    unlinkedVendor: t('grouping.unlinked_vendor'),
                    uncategorized: t('common:fallbacks.uncategorized'),
                    unknownDepartment: t('common:fallbacks.unassigned'),
                    noProcess: t('common:fallbacks.not_available'),
                    unknownRiskType: t('common:fallbacks.unknown_type'),
                    unknownRisk: t('common:fallbacks.unknown_risk'),
                }),
            renderGroupBody: state.workingSet.viewMode === 'risk' ? (group) => <RiskGroupMetaBody group={group} /> : undefined,
        }}
        testIdPrefix="kris"
        toolbar={<KriRegisterFilterBar facets={state.facets} filters={state.workingSet.filters} isLoading={state.isLoading} onClearAll={state.clearFilters} onFilterChange={state.updateFilter} onRefresh={() => void state.fetchKris()} onSearchChange={state.workingSet.updateSearch} search={state.workingSet.search} />}
    />;
}

export default KRIsPage;
