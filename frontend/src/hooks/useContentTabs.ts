import { useRef, type KeyboardEvent } from 'react';

interface ContentTabsOptions<T extends string> {
    tabs: readonly T[];
    activeTab: T;
    onChange: (tab: T) => void;
    idPrefix: string;
    /** Disabled tabs are skipped by the arrow / Home / End keys and never take the roving tab stop. */
    isTabDisabled?: (tab: T) => boolean;
}

/** DOM id of a tab button (shared with `components/ui/tabs.tsx` `TabPanel`). */
export function contentTabId(idPrefix: string, tab: string): string {
    return `${idPrefix}-tab-${tab}`;
}

/** DOM id of a tab panel (shared with `components/ui/tabs.tsx` `TabPanel`). */
export function contentPanelId(idPrefix: string, tab: string): string {
    return `${idPrefix}-panel-${tab}`;
}

const NEVER_DISABLED = () => false;

export function useContentTabs<T extends string>({
    tabs,
    activeTab,
    onChange,
    idPrefix,
    isTabDisabled = NEVER_DISABLED,
}: ContentTabsOptions<T>) {
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const tabId = (tab: T) => contentTabId(idPrefix, tab);
    const panelId = (tab: T) => contentPanelId(idPrefix, tab);

    const enabledIndexes = tabs.flatMap((tab, index) => (isTabDisabled(tab) ? [] : [index]));
    // Roving tab stop: the active tab, or the first enabled tab when the active
    // one is missing or disabled, so the tablist always stays reachable by Tab.
    const tabStop = tabs.includes(activeTab) && !isTabDisabled(activeTab)
        ? activeTab
        : tabs[enabledIndexes[0] ?? -1];

    const activateTab = (index: number) => {
        const tab = tabs[index];
        onChange(tab);
        tabRefs.current[index]?.focus();
    };

    const step = (index: number, direction: 1 | -1): number | null => {
        for (let offset = 1; offset <= tabs.length; offset += 1) {
            const candidate = (index + direction * offset + tabs.length * offset) % tabs.length;
            if (!isTabDisabled(tabs[candidate])) return candidate;
        }
        return null;
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        let nextIndex: number | null = null;

        if (event.key === 'ArrowRight') {
            nextIndex = step(index, 1);
        } else if (event.key === 'ArrowLeft') {
            nextIndex = step(index, -1);
        } else if (event.key === 'Home') {
            nextIndex = enabledIndexes[0] ?? null;
        } else if (event.key === 'End') {
            nextIndex = enabledIndexes[enabledIndexes.length - 1] ?? null;
        }

        if (nextIndex === null) return;

        event.preventDefault();
        activateTab(nextIndex);
    };

    const getTabProps = (tab: T, index: number) => ({
        id: tabId(tab),
        role: 'tab' as const,
        type: 'button' as const,
        tabIndex: tabStop === tab ? 0 : -1,
        'aria-selected': activeTab === tab,
        'aria-controls': panelId(tab),
        ref: (element: HTMLButtonElement | null) => {
            tabRefs.current[index] = element;
        },
        onClick: () => onChange(tab),
        onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => handleKeyDown(event, index),
    });

    const getPanelProps = (tab: T) => ({
        id: panelId(tab),
        role: 'tabpanel' as const,
        tabIndex: activeTab === tab ? 0 : -1,
        hidden: activeTab !== tab,
        'aria-labelledby': tabId(tab),
    });

    return { getTabProps, getPanelProps };
}
