import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { RegisterListShell } from '@/components/ict-register/RegisterListShell';
import { ExportDialog } from '@/components/reports/ExportDialog';
import type { SortDirection } from '@/components/tables';
import { useLanguage, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { Process, ProcessSortField } from '@/types/process';
import { approvalsApi } from '@/services/approvalsApi';
import { logError } from '@/services/logger';

import { buildProcessColumns } from './processes/processColumns';
import { ProcessRegisterFilterBar } from './processes/ProcessRegisterFilterBar';
import { ProcessPendingCreationsPanel } from './processes/ProcessPendingCreationsPanel';
import { PROCESS_REGISTER_CONFIG, type ProcessRegisterView } from './processes/processRegisterConfig';
import { processesEmptyStateKey } from './processes/processesPagePresentation';
import { useProcessesPageState } from './processes/useProcessesPageState';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';
import { SemanticFilterSummary } from './shared/SemanticFilterSummary';
import { parseProcessSemanticFilters } from './shared/ictRegisterSemanticFilters';
import { useIctRegisterSemanticPageState } from './shared/useIctRegisterPageState';

export function ProcessesPage() {
    const navigate = useNavigate();
    const { language } = useLanguage();
    const { semanticFilters, presentedSemanticFilters, removeSemanticFilter } =
        useIctRegisterSemanticPageState(parseProcessSemanticFilters);
    const { t } = useTranslation('processes');
    const state = useProcessesPageState(semanticFilters, language);
    const [cancellingApprovalId, setCancellingApprovalId] = useState<number | null>(null);
    const [pendingCreationCancelFailed, setPendingCreationCancelFailed] = useState(false);

    const cancelPendingCreation = async (approvalId: number) => {
        setCancellingApprovalId(approvalId);
        setPendingCreationCancelFailed(false);
        try {
            await approvalsApi.cancel(approvalId);
            await state.fetchProcesses();
        } catch (error) {
            logError('Failed to cancel pending Process creation.', error);
            setPendingCreationCancelFailed(true);
        } finally {
            setCancellingApprovalId(null);
        }
    };

    const columns = buildProcessColumns({
        t,
        onRestore: (processId, event) => {
            event.stopPropagation();
            void state.restoreProcess(processId);
        },
        canRestoreProcess: (process: Process) => resolveCapabilityFlag(process.capabilities, 'can_restore'),
    });
    const emptyMessage = t(processesEmptyStateKey(state.search.trim().length > 0));

    return (
        <RegisterListShell<Process, ProcessRegisterView>
            accessDeniedState={<ReadAccessDeniedState />}
            allView="all"
            title={t('title')}
            subtitle={t('subtitle')}
            views={PROCESS_REGISTER_CONFIG.views.map((view) => ({ value: view.value, label: t(view.labelKey) }))}
            view={state.viewMode}
            onViewChange={state.updateViewMode}
            canCreate={resolveCapabilityFlag(state.capabilities, 'can_create')}
            canExport={resolveCapabilityFlag(state.capabilities, 'can_export')}
            onCreate={() => void navigate('/processes/new')}
            createLabel={t('actions.new')}
            exportLabel={t('actions.export')}
            exportDialog={({ isOpen, onClose }) => (
                <ExportDialog
                    isOpen={isOpen}
                    onClose={onClose}
                    onSubmit={async () => {
                        await state.exportProcesses();
                        onClose();
                    }}
                    isSubmitting={state.isExporting}
                    dataTestId="processes-export-dialog"
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
                keyExtractor: (process) => process.id,
                onRowClick: (process) => void navigate(`/processes/${process.id}`),
                rowHref: (process) => `/processes/${process.id}`,
                rowLabel: (process) => process.l1_process,
                sortKey: state.sortField,
                sortDirection: state.sortDirection,
                onSort: (key, direction) => state.updateSort(
                    direction ? (key as ProcessSortField) : null,
                    direction as SortDirection,
                ),
            }}
            currentPage={state.currentPage}
            totalPages={state.totalPages}
            totalCount={state.totalCount}
            itemsPerPage={state.limit}
            onPageChange={state.setCurrentPage}
            onRetry={() => void state.fetchProcesses()}
            emptyMessage={state.hasLoadedOnce ? emptyMessage : t('common:loading.data')}
            grouping={{
                groups: state.groups,
                onBack: state.clearSelectedGroup,
                onSelectGroup: state.selectGroup,
                selectedGroupLabel: state.selectedGroupLabel,
                selectedGroupValue: state.selectedGroupValue,
                hideActive: true,
                hideHighlighted: true,
                groupLabel: (group) => {
                    if (group.value.startsWith('criticality:')) {
                        const code = group.value.slice('criticality:'.length);
                        return t(`values.preliminary_criticality.${code}`, t('values.unknown'));
                    }
                    if (group.value === '__unassigned__') return t('register.groups.unassigned');
                    if (group.value === '__unclassified__') return t('register.groups.unclassified');
                    if (group.value === '__unlinked_vendor__') return t('register.groups.no_linked_vendor');
                    return group.label;
                },
            }}
            testIdPrefix="processes"
            toolbar={(
                <div className="space-y-4">
                    {pendingCreationCancelFailed ? (
                        <div
                            role="alert"
                            aria-atomic="true"
                            className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm font-medium text-rose-300"
                        >
                            {t('pending_creation.cancel_failed')}
                        </div>
                    ) : null}
                    <ProcessPendingCreationsPanel
                        items={state.pendingCreations}
                        cancellingApprovalId={cancellingApprovalId}
                        onCancel={(approvalId) => void cancelPendingCreation(approvalId)}
                        onOpenRequest={(approvalId, tab) => void navigate(`/approvals?tab=${tab}&approvalId=${approvalId}`)}
                    />
                    <SemanticFilterSummary filters={presentedSemanticFilters} onRemove={removeSemanticFilter} />
                    <ProcessRegisterFilterBar
                        facets={state.facets}
                        filters={state.filters}
                        isLoading={state.isLoading}
                        onClearAll={state.clearFilters}
                        onFilterChange={state.updateFilter}
                        onRefresh={() => void state.fetchProcesses()}
                        onSearchChange={state.updateSearch}
                        search={state.search}
                    />
                </div>
            )}
        />
    );
}

export default ProcessesPage;
