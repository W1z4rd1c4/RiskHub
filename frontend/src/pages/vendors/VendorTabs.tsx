import { useTranslation } from '@/i18n/hooks';

import { VENDOR_TAB_DEFINITIONS, type VendorTabView } from './vendorDetailPresentation';

interface VendorTabsProps {
    activeTab: VendorTabView;
    onSelectTab: (tab: VendorTabView) => void;
}

export function VendorTabs({ activeTab, onSelectTab }: VendorTabsProps) {
    const { t } = useTranslation('vendors');

    return (
        <div className="flex items-center gap-2 border-b border-white/10">
            {VENDOR_TAB_DEFINITIONS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.value;
                return (
                    <button
                        key={tab.value}
                        onClick={() => onSelectTab(tab.value)}
                        className={`px-6 py-3 font-bold transition-all ${
                            isActive ? 'text-accent border-b-2 border-accent' : 'text-slate-500 hover:text-white'
                        }`}
                    >
                        <Icon className="h-4 w-4 inline mr-2" />
                        {t(tab.labelKey)}
                    </button>
                );
            })}
        </div>
    );
}
