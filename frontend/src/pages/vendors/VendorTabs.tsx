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
        <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-slate-950/90 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-slate-950/90 to-transparent" />
            <div className="overflow-x-auto border-b border-white/10 scrollbar-none">
                <div className="flex min-w-max items-center gap-2 px-2">
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
                                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-t-2xl border-b-2 px-5 py-3 font-bold transition-all ${
                                    isActive
                                        ? 'border-accent text-accent'
                                        : 'border-transparent text-slate-500 hover:text-white'
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                {t(tab.labelKey)}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
