import { useState, type ReactNode } from 'react';
import { Download, Plus } from 'lucide-react';

import {
    CollectionGroupDrillDown,
    Pagination,
    SortableTable,
    type Column,
    type SortDirection,
} from '@/components/tables';
import { TableErrorState } from '@/components/tables/tableError';
import { cn } from '@/lib/utils';
import type { CollectionGroup } from '@/types/collection';

export interface RegisterViewOption<TView extends string> {
    value: TView;
    label: string;
}

interface RegisterTableConfig<TItem extends object> {
    columns: Column<TItem>[];
    keyExtractor: (item: TItem) => string | number;
    onRowClick?: (item: TItem) => void;
    onSort?: (key: string, direction: SortDirection) => void;
    rowHref?: (item: TItem) => string;
    rowLabel?: (item: TItem) => string;
    sortDirection?: SortDirection;
    sortKey?: string | null;
}

interface RegisterGroupingConfig {
    groups: CollectionGroup[];
    groupLabel?: (group: CollectionGroup) => string;
    hideActive?: boolean;
    hideHighlighted?: boolean;
    onBack: () => void;
    onSelectGroup: (value: string, label: string) => void;
    renderGroupBody?: (group: CollectionGroup) => ReactNode;
    selectedGroupLabel: string | null;
    selectedGroupValue: string | null;
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
    onPageChange: (page: number) => void;
    onRetry: () => void;
    onViewChange: (view: TView) => void;
    table: Omit<RegisterTableConfig<TItem>, 'columns'>;
    testIdPrefix: string;
    title: string;
    subtitle: string;
    toolbar: ReactNode;
    totalCount: number;
    totalPages: number;
    currentPage: number;
    view: TView;
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
    currentPage,
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
    onPageChange,
    onRetry,
    onViewChange,
    subtitle,
    table,
    testIdPrefix,
    title,
    toolbar,
    totalCount,
    totalPages,
    view,
    views,
}: RegisterListShellProps<TItem, TView>) {
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

    if (isAccessDenied) return <>{accessDeniedState}</>;

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
            sortKey={table.sortKey}
            sortDirection={table.sortDirection}
            onSort={table.onSort}
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
        const hasSelectedGroup = Boolean(grouping.selectedGroupValue);
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
            onBack={grouping.onBack}
            onPageChange={onPageChange}
            onSelectGroup={grouping.onSelectGroup}
            renderTable={renderTable}
            selectedGroupLabel={grouping.selectedGroupLabel}
            selectedGroupValue={grouping.selectedGroupValue}
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
            <div className="space-y-8" data-testid={`${testIdPrefix}-register-shell`}>
                <header className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white">{title}</h1>
                        <p className="text-slate-500 font-medium mt-1">{subtitle}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {canExport && exportDialog ? (
                            <button
                                type="button"
                                onClick={() => setIsExportDialogOpen(true)}
                                disabled={isExporting}
                                data-testid={`${testIdPrefix}-export-button`}
                                className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-semibold"
                            >
                                <Download className="h-4 w-4" aria-hidden="true" />
                                {exportLabel}
                            </button>
                        ) : null}
                        {canCreate && onCreate ? (
                            <button
                                type="button"
                                onClick={onCreate}
                                data-testid={`${testIdPrefix}-create-button`}
                                className="px-5 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-all flex items-center gap-2"
                            >
                                <Plus className="h-5 w-5" aria-hidden="true" />
                                {createLabel}
                            </button>
                        ) : null}
                    </div>
                </header>

                <div className="flex flex-wrap gap-1 p-1 glass rounded-xl">
                    {views.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            aria-pressed={view === option.value}
                            data-testid={`${testIdPrefix}-view-${option.value}`}
                            onClick={() => onViewChange(option.value)}
                            className={cn(
                                'px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
                                view === option.value
                                    ? 'bg-accent text-white shadow-lg shadow-accent/20'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5',
                            )}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                {toolbar}
                {content}
            </div>

            {exportDialog?.({
                isOpen: isExportDialogOpen,
                onClose: () => setIsExportDialogOpen(false),
            })}
        </>
    );
}
