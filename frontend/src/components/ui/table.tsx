import * as React from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

/**
 * Presentational table primitives (audit 2026-09-30 §4.13, D14, DS-11).
 *
 * `SortableTable` renders these internally; static tables use them directly.
 * - `Table` owns the horizontal scroll container (a named, keyboard-scrollable
 *   region with a "more columns" cue) and the `density`.
 * - `THead` / `TBody` set the row recipe: header row `border-b border-border`,
 *   body rows `divide-y divide-border` with a `hover:bg-tint/5` hover.
 * - `TH` is `scope="col"` with the one header recipe; pass `onSort` to render a
 *   real sort `<button>` and `aria-sort` on the `th`.
 * - `TableRowButton` is the named first-cell button for keyboard row activation.
 */
export type TableDensity = 'default' | 'compact';
export type TableSortDirection = 'asc' | 'desc' | null;
export type TableCellAlign = 'left' | 'center' | 'right';

const CELL_PADDING: Readonly<Record<TableDensity, string>> = {
    default: 'px-6 py-4',
    compact: 'px-4 py-3',
};

const CELL_ALIGN: Readonly<Record<TableCellAlign, string>> = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
};

/** The D14 header recipe (formerly `SortableTable.tsx:260`). */
export const TABLE_HEADER_CLASS = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';

const TableDensityContext = React.createContext<TableDensity>('default');
const TableSectionContext = React.createContext<'head' | 'body'>('body');

interface TableViewportProps {
    children: React.ReactNode;
    regionLabel: string;
    continuationLabel: string;
    className?: string;
}

function TableViewport({ children, regionLabel, continuationLabel, className }: TableViewportProps) {
    const viewportRef = React.useRef<HTMLDivElement>(null);
    const cueId = React.useId();
    const [hasOverflow, setHasOverflow] = React.useState(false);
    const [canScrollRight, setCanScrollRight] = React.useState(false);

    const measure = React.useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const nextHasOverflow = viewport.scrollWidth > viewport.clientWidth + 1;
        setHasOverflow(nextHasOverflow);
        setCanScrollRight(nextHasOverflow && viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1);
    }, []);

    React.useEffect(() => {
        measure();
        window.addEventListener('resize', measure);
        const viewport = viewportRef.current;
        viewport?.addEventListener('scroll', measure);
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        if (observer && viewport) {
            observer.observe(viewport);
            if (viewport.firstElementChild) {
                observer.observe(viewport.firstElementChild);
            }
        }
        return () => {
            window.removeEventListener('resize', measure);
            viewport?.removeEventListener('scroll', measure);
            observer?.disconnect();
        };
    }, [measure]);

    React.useEffect(() => {
        measure();
    }, [children, measure]);

    React.useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.tabIndex = hasOverflow ? 0 : -1;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!hasOverflow || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
            event.preventDefault();
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const next = viewport.scrollLeft + direction * Math.max(120, viewport.clientWidth * 0.75);
            viewport.scrollLeft = Math.max(0, Math.min(next, viewport.scrollWidth - viewport.clientWidth));
            measure();
        };
        viewport.addEventListener('keydown', handleKeyDown);
        return () => viewport.removeEventListener('keydown', handleKeyDown);
    }, [hasOverflow, measure]);

    return (
        <div className={cn('relative', className)}>
            <div
                ref={viewportRef}
                role="region"
                aria-label={regionLabel}
                aria-describedby={canScrollRight ? cueId : undefined}
                className="w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
                {children}
            </div>
            {canScrollRight ? (
                <span
                    id={cueId}
                    className="pointer-events-none absolute bottom-2 right-2 rounded-md border border-border bg-background/95 py-1 px-2 text-xs font-medium text-foreground shadow-lg"
                >
                    {continuationLabel}
                </span>
            ) : null}
        </div>
    );
}

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
    /** `default` px-6 py-4 cells · `compact` px-4 py-3 cells. */
    density?: TableDensity;
    /** Accessible name of the scroll region; defaults to `common:tables.horizontal_scroll_region`. */
    regionLabel?: string;
    /** Classes for the outer scroll wrapper (the `<table>` takes `className`). */
    containerClassName?: string;
}

export function Table({ density = 'default', regionLabel, containerClassName, className, ...props }: TableProps) {
    const { t } = useTranslation('common');
    return (
        <TableDensityContext.Provider value={density}>
            <TableViewport
                className={containerClassName}
                regionLabel={regionLabel ?? t('tables.horizontal_scroll_region')}
                continuationLabel={t('tables.more_columns_right')}
            >
                <table {...props} className={cn('w-full', className)} />
            </TableViewport>
        </TableDensityContext.Provider>
    );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return (
        <TableSectionContext.Provider value="head">
            <thead {...props} className={className} />
        </TableSectionContext.Provider>
    );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return (
        <TableSectionContext.Provider value="body">
            <tbody {...props} className={cn('divide-y divide-border', className)} />
        </TableSectionContext.Provider>
    );
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
    const section = React.useContext(TableSectionContext);
    return (
        <tr
            {...props}
            className={cn(section === 'head' ? 'border-b border-border' : 'transition-colors hover:bg-tint/5', className)}
        />
    );
}

function SortIcon({ direction }: { direction: TableSortDirection }) {
    if (direction === 'asc') return <ChevronUp className="size-4 text-accent-text" aria-hidden="true" />;
    if (direction === 'desc') return <ChevronDown className="size-4 text-accent-text" aria-hidden="true" />;
    return <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />;
}

const ARIA_SORT: Readonly<Record<'asc' | 'desc', React.AriaAttributes['aria-sort']>> = {
    asc: 'ascending',
    desc: 'descending',
};

export interface THProps extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'align'> {
    align?: TableCellAlign;
    /** Makes the header sortable: renders a sort button and `aria-sort`. */
    onSort?: () => void;
    /** Current direction of this column (`null` = not the active sort). */
    sortDirection?: TableSortDirection;
}

export function TH({
    align = 'left',
    onSort,
    sortDirection = null,
    scope = 'col',
    className,
    children,
    ...props
}: THProps) {
    const density = React.useContext(TableDensityContext);
    const ariaSort = onSort ? (sortDirection ? ARIA_SORT[sortDirection] : 'none') : undefined;
    return (
        <th
            aria-sort={ariaSort}
            {...props}
            scope={scope}
            className={cn(CELL_PADDING[density], CELL_ALIGN[align], TABLE_HEADER_CLASS, className)}
        >
            {onSort ? (
                <button
                    type="button"
                    onClick={onSort}
                    className="inline-flex items-center gap-2 rounded uppercase tracking-wider transition-colors hover:text-foreground focus-ring"
                >
                    {children}
                    <SortIcon direction={sortDirection} />
                </button>
            ) : (
                children
            )}
        </th>
    );
}

export interface TDProps extends Omit<React.TdHTMLAttributes<HTMLTableCellElement>, 'align'> {
    align?: TableCellAlign;
}

export function TD({ align, className, ...props }: TDProps) {
    const density = React.useContext(TableDensityContext);
    return <td {...props} className={cn(CELL_PADDING[density], align && CELL_ALIGN[align], className)} />;
}

export interface TableRowButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
    /** Visually hidden text appended to the visible content (the button's accessible name). */
    srLabel?: string;
}

/**
 * Named first-cell button for keyboard row activation (D14, AX-02): native
 * Enter / Space, and its click never bubbles to the row's mouse handler.
 */
export const TableRowButton = React.forwardRef<HTMLButtonElement, TableRowButtonProps>(
    ({ srLabel, onClick, className, children, ...props }, ref) => (
        <button
            ref={ref}
            {...props}
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                onClick?.(event);
            }}
            className={cn(
                'inline-flex max-w-full items-center gap-2 rounded-md text-left focus-ring',
                className,
            )}
        >
            {children}
            {srLabel ? (
                <>
                    {' '}
                    <span className="sr-only">{srLabel}</span>
                </>
            ) : null}
        </button>
    ),
);
TableRowButton.displayName = 'TableRowButton';
