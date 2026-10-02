import * as React from 'react';
import type { ReactNode } from 'react';

import { EmptyState, type StateLayout } from '@/components/ui/state';
import { cn } from '@/lib/utils';

/**
 * Chart frame (audit 2026-09-30 §4.15, GAP-D-11): the one wrapper every chart
 * renders through.
 *
 * - `summary` names the chart: a `figure` labelled by a visually hidden
 *   `figcaption` that says what is plotted and gives its headline numbers.
 * - `table` repeats the plotted values as a visually hidden data table, so the
 *   data never lives only in the graphic.
 * - `legend` is a visible legend under the plot: a swatch plus a text label
 *   (and optional value) on the AA text tokens, so no series is identified by
 *   colour alone and the legend text keeps its contrast in every theme. With
 *   `onLegendSelect` each item is a toggle button (`aria-pressed`), the
 *   keyboard path for charts whose segments filter on click.
 * - `isEmpty` renders one `EmptyState` instead of an empty plot.
 *
 * The frame is deliberately not `role="img"`: Recharts' accessibility layer
 * (keyboard tooltip navigation with live announcements) and drill-down links
 * inside a chart are interactive, and a presentational `img` would hide them
 * from assistive technology (axe `nested-interactive`).
 *
 * Series colours come from `useChartTheme` / `lib/cssTokens.ts`; a legend
 * swatch takes the same colour string as its series.
 */
export interface ChartLegendItem {
    key: string;
    label: ReactNode;
    /** CSS colour of the series, from `useChartTheme` (token-derived). */
    color: string;
    /** Optional value shown after the label (already formatted). */
    value?: ReactNode;
}

export interface ChartDataTableRow {
    key: string;
    /** Row header (the category, period or band). */
    header: ReactNode;
    cells: readonly ReactNode[];
}

export interface ChartDataTable {
    /** Optional caption; the figure is already named by `summary`. */
    caption?: ReactNode;
    /** Column headers; the first one heads the row-header column. */
    columns: readonly ReactNode[];
    rows: readonly ChartDataTableRow[];
}

export interface ChartFrameProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
    /** One or two sentences: what is plotted and its headline numbers (translated). */
    summary: string;
    children: ReactNode;
    /** The plotted values, rendered as a visually hidden table. */
    table?: ChartDataTable;
    /** Visible legend under the plot. */
    legend?: readonly ChartLegendItem[];
    /** Makes every legend item a toggle button that reports its key. */
    onLegendSelect?: (key: string) => void;
    /** Key of the pressed legend item (with `onLegendSelect`). */
    selectedLegendKey?: string | null;
    /** Renders the empty state instead of the plot. */
    isEmpty?: boolean;
    emptyTitle?: ReactNode;
    emptyDescription?: ReactNode;
    emptyLayout?: StateLayout;
    testId?: string;
}

function LegendSwatch({ color }: { color: string }) {
    return (
        <svg aria-hidden="true" viewBox="0 0 8 8" className="size-2.5 shrink-0">
            <circle cx="4" cy="4" r="4" fill={color} />
        </svg>
    );
}

function ChartLegend({
    items,
    onSelect,
    selectedKey,
}: {
    items: readonly ChartLegendItem[];
    onSelect?: (key: string) => void;
    selectedKey?: string | null;
}) {
    return (
        <ul
            data-chart-legend=""
            className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs font-medium text-muted-foreground"
        >
            {items.map((item) => {
                const content = (
                    <>
                        <LegendSwatch color={item.color} />
                        <span>{item.label}</span>
                        {item.value !== undefined && item.value !== null ? (
                            <>
                                {/* A text separator so the accessible name reads "Label 4", not "Label4". */}
                                {' '}
                                <span className="font-semibold tabular-nums text-foreground">{item.value}</span>
                            </>
                        ) : null}
                    </>
                );
                return (
                    <li key={item.key} className="flex items-center">
                        {onSelect ? (
                            <button
                                type="button"
                                aria-pressed={selectedKey === item.key}
                                onClick={() => onSelect(item.key)}
                                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-tint/5 hover:text-foreground focus-ring aria-pressed:bg-tint/10 aria-pressed:text-foreground"
                            >
                                {content}
                            </button>
                        ) : (
                            <span className="inline-flex items-center gap-1.5">{content}</span>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

function ChartDataTableView({ table }: { table: ChartDataTable }) {
    const [rowHeaderColumn, ...valueColumns] = table.columns;
    return (
        <table className="sr-only">
            {table.caption ? <caption>{table.caption}</caption> : null}
            <thead>
                <tr>
                    <th scope="col">{rowHeaderColumn}</th>
                    {valueColumns.map((column, index) => (
                        <th key={index} scope="col">{column}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {table.rows.map((row) => (
                    <tr key={row.key}>
                        <th scope="row">{row.header}</th>
                        {row.cells.map((cell, index) => (
                            <td key={index}>{cell}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export const ChartFrame = React.forwardRef<HTMLElement, ChartFrameProps>(
    (
        {
            summary,
            children,
            table,
            legend,
            onLegendSelect,
            selectedLegendKey = null,
            isEmpty = false,
            emptyTitle,
            emptyDescription,
            emptyLayout = 'section',
            testId,
            className,
            ...props
        },
        ref,
    ) => {
        const captionId = React.useId();

        if (isEmpty) {
            return (
                <EmptyState
                    layout={emptyLayout}
                    title={emptyTitle ?? summary}
                    description={emptyDescription}
                    className={className}
                    testId={testId}
                />
            );
        }

        return (
            <figure
                ref={ref}
                {...props}
                aria-labelledby={captionId}
                data-testid={testId}
                className={cn('m-0 w-full min-w-0', className)}
            >
                <figcaption id={captionId} className="sr-only">{summary}</figcaption>
                {children}
                {legend && legend.length > 0 ? (
                    <ChartLegend items={legend} onSelect={onLegendSelect} selectedKey={selectedLegendKey} />
                ) : null}
                {table ? <ChartDataTableView table={table} /> : null}
            </figure>
        );
    },
);
ChartFrame.displayName = 'ChartFrame';
