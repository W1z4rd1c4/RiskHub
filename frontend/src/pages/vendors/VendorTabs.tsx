import { useEffect, useRef } from 'react';
import { useTranslation } from '@/i18n/hooks';

import { VENDOR_TAB_DEFINITIONS, type VendorTabView } from './vendorDetailPresentation';

interface VendorTabsProps {
    activeTab: VendorTabView;
    onSelectTab: (tab: VendorTabView) => void;
}

export function VendorTabs({ activeTab, onSelectTab }: VendorTabsProps) {
    const { t } = useTranslation('vendors');
    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    useEffect(() => {
        const target = tabRefs.current[activeTab];
        if (!target) {
            return;
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [activeTab]);

    return (
        <div className="overflow-x-auto border-b border-white/10 scrollbar-hide">
            <div className="flex min-w-max items-center gap-2">
                {VENDOR_TAB_DEFINITIONS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.value;

                    return (
                        <button
                            key={tab.value}
                            ref={(node) => {
                                tabRefs.current[tab.value] = node;
                            }}
                            type="button"
                            onClick={() => onSelectTab(tab.value)}
                            className={`px-6 py-3 font-bold transition-all whitespace-nowrap ${
                                isActive
                                    ? 'text-accent border-b-2 border-accent'
                                    : 'text-slate-500 hover:text-white'
                            }`}
                        >
                            <Icon className="mr-2 inline h-4 w-4" />
                            {t(tab.labelKey)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
