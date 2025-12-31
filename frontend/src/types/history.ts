/**
 * History types for shared history visualization components.
 */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Status color mapping for history items */
export type HistoryStatus = 'success' | 'warning' | 'danger' | 'neutral';

/** Key-value metadata displayed as pills */
export interface HistoryMetaItem {
    label: string;
    value: string;
    tone?: HistoryStatus;
}

/** Single item in a history timeline */
export interface HistoryTimelineItem {
    id: string | number;
    title: string;
    subtitle?: string;
    timestamp: string;
    status?: HistoryStatus;
    meta?: HistoryMetaItem[];
    icon?: LucideIcon | ReactNode;
    badge?: string;
}

/** Comparison field for change cards (before/after) */
export interface HistoryComparisonField {
    label: string;
    before: string;
    after: string;
    delta?: string;
    direction?: 'up' | 'down' | 'flat';
    tone?: HistoryStatus;
}

/** Data point for trend charts */
export interface HistoryTrendPoint {
    label: string;
    value: number;
    status?: 'within' | 'above' | 'below' | 'neutral';
}
