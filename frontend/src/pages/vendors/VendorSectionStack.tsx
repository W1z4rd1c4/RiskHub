import type { ReactNode } from 'react';
import { useTranslation } from '@/i18n/hooks';

import type { VendorSectionView } from './vendorDetailPresentation';

interface VendorSectionStackItem {
    content: ReactNode;
    id: VendorSectionView;
    labelKey: string;
}

interface VendorSectionStackProps {
    activeSection: VendorSectionView;
    onSelectSection: (section: VendorSectionView) => void;
    sections: VendorSectionStackItem[];
}

export function VendorSectionStack({
    activeSection,
    onSelectSection,
    sections,
}: VendorSectionStackProps) {
    const { t } = useTranslation('vendors');

    const activeContent = sections.find((s) => s.id === activeSection)?.content || sections[0]?.content;

    return (
        <div className="space-y-6">
            <div className="overflow-x-auto border-b border-white/5 pb-1 scrollbar-hide">
                <div className="flex min-w-max items-center gap-2">
                    {sections.map((section) => {
                        const isActive = activeSection === section.id || (!activeSection && section === sections[0]);
                        return (
                            <button
                                key={section.id}
                                type="button"
                                onClick={() => onSelectSection(section.id)}
                                className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${isActive
                                    ? 'border-accent/30 bg-accent/10 text-accent'
                                    : 'border-white/10 bg-white/[0.03] text-slate-500 hover:text-white hover:border-white/20'
                                    }`}
                            >
                                {t(section.labelKey)}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-6 pt-2">
                {activeContent}
            </div>
        </div>
    );
}
