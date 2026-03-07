import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
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
    const refs = useRef<Record<string, HTMLDivElement | null>>({});

    useEffect(() => {
        const target = refs.current[activeSection];
        if (!target || typeof target.scrollIntoView !== 'function') {
            return;
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [activeSection]);

    return (
        <div className="space-y-6">
            <section className="glass-card p-4">
                <div className="flex flex-wrap gap-2">
                    {sections.map((section) => {
                        const isActive = activeSection === section.id;
                        return (
                            <button
                                key={section.id}
                                type="button"
                                onClick={() => onSelectSection(section.id)}
                                className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
                                    isActive
                                        ? 'bg-accent text-white shadow-lg shadow-accent/20'
                                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                {t(section.labelKey)}
                            </button>
                        );
                    })}
                </div>
            </section>

            <div className="space-y-6">
                {sections.map((section) => (
                    <div
                        key={section.id}
                        ref={(node) => {
                            refs.current[section.id] = node;
                        }}
                        id={`vendor-section-${section.id}`}
                        className="scroll-mt-32"
                    >
                        {section.content}
                    </div>
                ))}
            </div>
        </div>
    );
}
