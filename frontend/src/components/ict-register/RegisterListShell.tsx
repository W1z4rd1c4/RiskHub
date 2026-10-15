import { useState, type ReactNode } from 'react';
import { Download, Plus } from 'lucide-react';

import {
    CollectionGroupDrillDown,
    Pagination,
    SortableTable,
    type Column,
} from '@/components/tables';
import { TableErrorState } from '@/components/tables/tableError';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CollectionGroup } from '@/types/collection';
import type { RegisterListWorkingSet } from '@/pages/shared/useRegisterUrlWorkingSet';

export interface RegisterViewOption<TView extends string> {
    value: TView;
    label: string;
}

interface RegisterTableConfig<TItem extends object> {
    columns: Column<TItem>[];
    keyExtractor: (item: TItem) => string | number;
    onRowClick?: (item: TItem) => void;
    rowHref?: (item: TItem) => string;
    rowLabel?: (item: TItem) => string;
}

interface RegisterGroupingConfig {
    groups: CollectionGroup[];
    groupLabel?: (group: CollectionGroup) => string;
    hideActive?: boolean;
    hideHighlighted?: boolean;
    renderGroupBody?: (group: CollectionGroup) => ReactNode;
    selectedGroupLabel: string | null;
}

export interface RegisterExportDialogControls {
    isOpen: boolean;
    onClose: () => void;
}

interface RegisterListShellProps<TItem extends object, TView extends string> {
    accessDeniedState: ReactNode;
    allView: TView;
    canCreate?: boolean;
    canExport?: boolean;
    columns: RegisterTableConfig<TItem>['columns'];
    createLabel: string;
    emptyMessage: string;
    errorMessage?: string;
    exportDialog?: (controls: RegisterExportDialogControls) => ReactNode;
    exportLabel: string;
    grouping?: RegisterGroupingConfig;
    isAccessDenied: boolean;
    isError: boolean;
    isExporting?: boolean;
    isLoading: boolean;
    items: TItem[];
    itemsPerPage: number;
    onCreate?: () => void;
    onRetry: () => void;
    table: Omit<RegisterTableConfig<TItem>, 'columns'>;
    testIdPrefix: string;
    title: string;
    subtitle: string;
    toolbar: ReactNode;
    totalCount: number;
    totalPages: number;
    workingSet: RegisterListWorkingSet<TView>;
    views: readonly RegisterViewOption<TView>[];
}

/**
 * Shared register-list owner. Entity pages supply vocabulary, rows, and callbacks;
 * this component owns the common views, table/grouping branch, states, pagination,
 * and export-dialog lifecycle.
 */
export function RegisterListShell<TItem extends object, TView extends string>({
    accessDeniedState,
    allView,
    canCreate = false,
    canExport = false,
    columns,
    createLabel,
    emptyMessage,
    errorMessage,
    exportDialog,
    exportLabel,
    grouping,
    isAccessDenied,
    isError,
    isExporting = false,
    isLoading,
    items,
    itemsPerPage,
    onCreate,
    onRetry,
    subtitle,
    table,
    testIdPrefix,
    title,
    toolbar,
    totalCount,
    totalPages,
    workingSet,
    views,
}: RegisterListShellProps<TItem, TView>) {
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const { currentPage, viewMode: view, setCurrentPage: onPageChange, updateViewMode: onViewChange } = workingSet;

    // D7 / DS-15: the register title is the route's one `h1` (and its
    // `document.title`) in every state, including access denied. The
    // `-register-shell` test id stays reserved for the readable register.
    if (isAccessDenied) {
        return (
            <PageContainer data-testid={`${testIdPrefix}-register-access-denied`}>
                <PageHeader title={title} />
                {accessDeniedState}
            </PageContainer>
        );
    }

    const showExport = canExport && Boolean(exportDialog);
    const showCreate = canCreate && Boolean(onCreate);

    const renderTable = (rows: TItem[]) => (
        <SortableTable
            data={rows}
            columns={columns}
            keyExtractor={table.keyExtractor}
            onRowClick={table.onRowClick}
            rowHref={table.rowHref}
            rowLabel={table.rowLabel}
            isLoading={isLoading}
            isError={isError}
            onRetry={onRetry}
            errorMessage={errorMessage}
            emptyMessage={emptyMessage}
            sortKey={workingSet.sortField}
            sortDirection={workingSet.sortDirection}
            onSort={workingSet.updateSort}
        />
    );

    const content = view === allView || !grouping ? (
        <div className="space-y-4">
            {renderTable(items)}
            {!isLoading && !isError && totalCount > 0 ? (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={onPageChange}
                    totalItems={totalCount}
                    itemsPerPage={itemsPerPage}
                />
            ) : null}
        </div>
    ) : (() => {
        const hasSelectedGroup = Boolean(workingSet.selectedGroupValue);
        const hasLastGoodGroupedData = hasSelectedGroup ? items.length > 0 : grouping.groups.length > 0;

        // First-load failures/loading still use the table's full replacement state.
        // Once grouped data exists, keep it mounted while a refetch is in flight or
        // fails. A selected group delegates its single stale-data banner to the
        // SortableTable; the group-card summary needs the same banner explicitly.
        if ((isError || isLoading) && !hasLastGoodGroupedData) {
            return renderTable([]);
        }

        const drillDown = <CollectionGroupDrillDown
            currentPage={currentPage}
            groups={grouping.groups}
            items={items}
            itemsPerPage={itemsPerPage}
            onBack={workingSet.clearSelectedGroup}
            onPageChange={onPageChange}
            onSelectGroup={workingSet.selectGroup}
            renderTable={renderTable}
            selectedGroupLabel={grouping.selectedGroupLabel}
            selectedGroupValue={workingSet.selectedGroupValue}
            totalCount={totalCount}
            totalPages={totalPages}
            emptyMessage={emptyMessage}
            hideActive={grouping.hideActive}
            hideHighlighted={grouping.hideHighlighted}
            groupLabel={grouping.groupLabel}
            renderGroupBody={grouping.renderGroupBody}
        />;

        if (isError && !hasSelectedGroup) {
            return (
                <div className="space-y-3">
                    <TableErrorState variant="banner" onRetry={onRetry} message={errorMessage} />
                    {drillDown}
                </div>
            );
        }

        return drillDown;
    })();

    return (
        <>
            <PageContainer data-testid={`${testIdPrefix}-register-shell`}>
                <PageHeader
                    title={title}
                    description={subtitle}
                    actions={showExport || showCreate ? (
                        <>
                            {showExport ? (
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsExportDialogOpen(true)}
                                    isLoading={isExporting}
                                    data-testid={`${testIdPrefix}-export-button`}
                                    className="font-semibold"
                                >
                                    {!isExporting ? <Download aria-hidden="true" /> : null}
                                    {exportLabel}
                                </Button>
                            ) : null}
                            {showCreate ? (
                                <Button
                                    variant="accent"
                                    onClick={onCreate}
                                    data-testid={`${testIdPrefix}-create-button`}
                                    className="px-5 font-bold"
                                >
                                    <Plus aria-hidden="true" />
                                    {createLabel}
                                </Button>
                            ) : null}
                        </>
                    ) : undefined}
                />

                <div className="flex flex-wrap gap-1 p-1 glass rounded-xl">
                    {views.map((option) => (
                        <Button
                            key={option.value}
                            variant="secondary"
                            size="compact"
                            aria-pressed={view === option.value}
                            data-testid={`${testIdPrefix}-view-${option.value}`}
                            onClick={() => onViewChange(option.value)}
                            className={cn(
                                'px-4 text-sm font-medium duration-200',
                                view === option.value
                                    ? 'bg-accent text-accent-foreground shadow-lg shadow-accent/20 hover:bg-accent hover:text-accent-foreground'
                                    : '',
                            )}
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>

                {toolbar}
                {content}
            </PageContainer>

            {exportDialog?.({
                isOpen: isExportDialogOpen,
                onClose: () => setIsExportDialogOpen(false),
            })}
        </>
    );
}
