import * as React from 'react';
import { cva } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { contentPanelId, contentTabId, useContentTabs } from '@/hooks/useContentTabs';
import { cn } from '@/lib/utils';

/**
 * Tabs (audit 2026-09-30 §4.12, D8, DS-12): the one tab primitive, built on
 * `useContentTabs` (roving tabindex; ArrowLeft / ArrowRight / Home / End move and
 * activate; disabled tabs are skipped). No Radix.
 *
 * - `underline`: in-entity / detail tabs.
 * - `pill`: page-level views.
 *
 * A switcher that filters data rather than switching panels is not tabs: use a
 * segmented `Button` group with `aria-pressed` instead.
 */
const tabListVariants = cva('', {
    variants: {
        variant: {
            underline: 'flex gap-1 overflow-x-auto border-b border-border',
            pill: 'inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-nested/60 p-1',
        },
    },
    defaultVariants: { variant: 'underline' },
});

const tabVariants = cva(
    'inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50',
    {
        variants: {
            variant: {
                underline:
                    'border-b-2 border-transparent px-4 py-2.5 text-muted-foreground hover:text-foreground aria-selected:border-accent aria-selected:text-accent-text',
                pill:
                    'rounded-lg px-4 py-2 text-muted-foreground hover:bg-tint/5 hover:text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground aria-selected:hover:bg-accent aria-selected:hover:text-accent-foreground',
            },
        },
        defaultVariants: { variant: 'underline' },
    },
);

export type TabsVariant = 'underline' | 'pill';

export interface TabItem<T extends string> {
    id: T;
    /** Translated, visible label (also the tab's accessible name). */
    label: React.ReactNode;
    icon?: LucideIcon;
    /** Optional count shown after the label. */
    count?: number;
    disabled?: boolean;
    testId?: string;
}

export interface TabListProps<T extends string> {
    tabs: ReadonlyArray<TabItem<T>>;
    activeTab: T;
    onChange: (tab: T) => void;
    /** Prefix for the tab / panel ids; pair it with the same prefix on `TabPanel`. */
    idPrefix: string;
    variant?: TabsVariant;
    /** Accessible name of the tablist. */
    ariaLabel: string;
    className?: string;
    'data-testid'?: string;
}

export function TabList<T extends string>({
    tabs,
    activeTab,
    onChange,
    idPrefix,
    variant = 'underline',
    ariaLabel,
    className,
    'data-testid': testId,
}: TabListProps<T>) {
    const ids = tabs.map((tab) => tab.id);
    const { getTabProps } = useContentTabs({
        tabs: ids,
        activeTab,
        onChange,
        idPrefix,
        isTabDisabled: (id) => tabs.some((tab) => tab.id === id && tab.disabled),
    });

    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            aria-orientation="horizontal"
            data-testid={testId}
            className={cn(tabListVariants({ variant }), className)}
        >
            {tabs.map((tab, index) => {
                const Icon = tab.icon;
                return (
                    <button
                        key={tab.id}
                        {...getTabProps(tab.id, index)}
                        disabled={tab.disabled}
                        data-testid={tab.testId}
                        className={tabVariants({ variant })}
                    >
                        {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
                        {tab.label}
                        {tab.count !== undefined ? (
                            <Badge size="sm" tone="neutral" className="tabular-nums">
                                {tab.count}
                            </Badge>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}

export interface TabPanelProps<T extends string>
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'id' | 'role' | 'hidden' | 'tabIndex'> {
    tab: T;
    activeTab: T;
    idPrefix: string;
    children?: React.ReactNode;
}

/** The panel for `tab`; hidden (but mounted) unless `tab === activeTab`. */
export function TabPanel<T extends string>({ tab, activeTab, idPrefix, children, ...props }: TabPanelProps<T>) {
    const isActive = tab === activeTab;
    return (
        <div
            {...props}
            id={contentPanelId(idPrefix, tab)}
            role="tabpanel"
            aria-labelledby={contentTabId(idPrefix, tab)}
            tabIndex={isActive ? 0 : -1}
            hidden={!isActive}
        >
            {children}
        </div>
    );
}
