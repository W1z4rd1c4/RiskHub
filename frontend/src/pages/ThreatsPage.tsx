import { useNavigate } from 'react-router-dom';

import { RegisterListShell } from '@/components/ict-register/RegisterListShell';
import { ExportDialog } from '@/components/reports/ExportDialog';
import type { SortDirection } from '@/components/tables';
import { useLanguage, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { CollectionGroup } from '@/types/collection';
import type { ThreatListItem, ThreatSortField } from '@/types/threat';

import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';
import { buildThreatColumns } from './threats/threatColumns';
import { ThreatRegisterFilterBar } from './threats/ThreatRegisterFilterBar';
import { THREAT_REGISTER_CONFIG, type ThreatRegisterView } from './threats/threatRegisterConfig';
import { threatsEmptyStateKey } from './threats/threatsPagePresentation';
import { useThreatsPageState } from './threats/useThreatsPageState';

export function ThreatsPage() {
    const navigate = useNavigate();
    const { language } = useLanguage();
    const { t } = useTranslation('threats');
    const state = useThreatsPageState(language);
    const presentGroupLabel = (group: Pick<CollectionGroup, 'label' | 'value'>): string => {
        if (group.value.startsWith('category:')) {
            return t(`categories.${group.value.slice('category:'.length)}`, t('register.values.unknown'));
        }
        if (group.value === '__uncategorized__') return t('register.groups.uncategorized');
        if (group.value === '__unassigned__') return t('register.groups.unassigned');
        if (group.value === '__unspecified__') return t('register.groups.unspecified');
        if (group.value === '__unlinked_risk__') return t('register.groups.no_linked_risk');
        return group.label;
    };
    const columns = buildThreatColumns({
        t,
        onRestore: (threatId, event) => {
            event.stopPropagation();
            void state.restoreThreat(threatId);
        },
        canRestoreThreat: (threat: ThreatListItem) => resolveCapabilityFlag(threat.capabilities, 'can_restore'),
    });

    return (
        <RegisterListShell<ThreatListItem, ThreatRegisterView>
            accessDeniedState={<ReadAccessDeniedState />}
            allView="all"
            title={t('title')}
            subtitle={t('subtitle')}
            views={THREAT_REGISTER_CONFIG.views.map((view) => ({ value: view.value, label: t(view.labelKey) }))}
            view={state.viewMode}
            onViewChange={state.updateViewMode}
            canCreate={resolveCapabilityFlag(state.capabilities, 'can_create')}
            canExport={resolveCapabilityFlag(state.capabilities, 'can_export')}
            onCreate={() => void navigate('/threats/new')}
            createLabel={t('actions.new')}
            exportLabel={t('actions.export')}
            exportDialog={({ isOpen, onClose }) => (
                <ExportDialog
                    isOpen={isOpen}
                    onClose={onClose}
                    onSubmit={async () => {
                        await state.exportThreats();
                        onClose();
                    }}
                    isSubmitting={state.isExporting}
                    dataTestId="threats-export-dialog"
                    title={t('register.export.title')}
                />
            )}
            isAccessDenied={state.isAccessDenied}
            isError={Boolean(state.errorKey)}
            errorMessage={state.errorKey ? t(state.errorKey) : undefined}
            isExporting={state.isExporting}
            isLoading={state.isLoading}
            items={state.items}
            columns={columns}
            table={{
                keyExtractor: (threat) => threat.id,
                onRowClick: (threat) => void navigate(`/threats/${threat.id}`),
                rowHref: (threat) => `/threats/${threat.id}`,
                rowLabel: (threat) => threat.name,
                sortKey: state.sortField,
                sortDirection: state.sortDirection,
                onSort: (key, direction) => state.updateSort(
                    direction ? key as ThreatSortField : null,
                    direction as SortDirection,
                ),
            }}
            currentPage={state.currentPage}
            totalPages={state.totalPages}
            totalCount={state.totalCount}
            itemsPerPage={state.limit}
            onPageChange={state.setCurrentPage}
            onRetry={() => void state.fetchThreats()}
            emptyMessage={state.hasLoadedOnce
                ? t(threatsEmptyStateKey(state.search.trim().length > 0))
                : t('common:loading.data')}
            grouping={{
                groups: state.groups,
                onBack: state.clearSelectedGroup,
                onSelectGroup: state.selectGroup,
                selectedGroupLabel: state.selectedGroupValue
                    ? presentGroupLabel({
                        value: state.selectedGroupValue,
                        label: state.selectedGroupLabel ?? state.selectedGroupValue,
                    })
                    : null,
                selectedGroupValue: state.selectedGroupValue,
                hideActive: true,
                hideHighlighted: true,
                groupLabel: presentGroupLabel,
            }}
            testIdPrefix="threats"
            toolbar={(
                <ThreatRegisterFilterBar
                    facets={state.facets}
                    filters={state.filters}
                    isLoading={state.isLoading}
                    onClearAll={state.clearFilters}
                    onFilterChange={state.updateFilter}
                    onRefresh={() => void state.fetchThreats()}
                    onSearchChange={state.updateSearch}
                    search={state.search}
                />
            )}
        />
    );
}

export default ThreatsPage;
