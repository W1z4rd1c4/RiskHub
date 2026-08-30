import { useRef, type KeyboardEvent } from 'react';

interface ContentTabsOptions<T extends string> {
    tabs: readonly T[];
    activeTab: T;
    onChange: (tab: T) => void;
    idPrefix: string;
}

export function useContentTabs<T extends string>({
    tabs,
    activeTab,
    onChange,
    idPrefix,
}: ContentTabsOptions<T>) {
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const tabId = (tab: T) => `${idPrefix}-tab-${tab}`;
    const panelId = (tab: T) => `${idPrefix}-panel-${tab}`;

    const activateTab = (index: number) => {
        const tab = tabs[index];
        onChange(tab);
        tabRefs.current[index]?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        let nextIndex: number | null = null;

        if (event.key === 'ArrowRight') {
            nextIndex = (index + 1) % tabs.length;
        } else if (event.key === 'ArrowLeft') {
            nextIndex = (index - 1 + tabs.length) % tabs.length;
        } else if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = tabs.length - 1;
        }

        if (nextIndex === null) return;

        event.preventDefault();
        activateTab(nextIndex);
    };

    const getTabProps = (tab: T, index: number) => ({
        id: tabId(tab),
        role: 'tab' as const,
        type: 'button' as const,
        tabIndex: activeTab === tab ? 0 : -1,
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
