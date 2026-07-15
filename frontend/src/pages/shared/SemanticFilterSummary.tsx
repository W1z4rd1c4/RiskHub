import { X } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

interface SemanticFilterSummaryProps {
    filters: Record<string, string | number | boolean>;
    onRemove: (key: string) => void;
}

const FILTER_LABEL_KEYS: Record<string, string> = {
    cif: 'semantic_filters.keys.cif',
    has_process_link: 'semantic_filters.keys.has_process_link',
    criticality: 'semantic_filters.keys.criticality',
    has_direct_process_link: 'semantic_filters.keys.has_direct_process_link',
    has_roi_contract: 'semantic_filters.keys.has_roi_contract',
    has_sub_outsourcing: 'semantic_filters.keys.has_sub_outsourcing',
    tier: 'semantic_filters.keys.tier',
    ict_linked: 'semantic_filters.keys.ict_linked',
    above_tolerance: 'semantic_filters.keys.above_tolerance',
    response: 'semantic_filters.keys.response',
    gross_probability: 'semantic_filters.keys.gross_probability',
    gross_impact: 'semantic_filters.keys.gross_impact',
    gross_band: 'semantic_filters.keys.gross_band',
    net_band: 'semantic_filters.keys.net_band',
};

export function SemanticFilterSummary({ filters, onRemove }: SemanticFilterSummaryProps) {
    const { t } = useTranslation('common');
    const entries = Object.entries(filters);
    if (entries.length === 0) return null;

    return (
        <section className="glass-card flex flex-wrap items-center gap-2" data-testid="semantic-filter-summary">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t('semantic_filters.filtered_by')}
            </span>
            {entries.map(([key, value]) => (
                <span
                    key={key}
                    className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm text-slate-200"
                >
                    <span>
                        {t(FILTER_LABEL_KEYS[key] ?? 'semantic_filters.keys.unknown')}:{' '}
                        {value === true
                            ? t('semantic_filters.values.yes')
                            : value === 'acceptance'
                              ? t('semantic_filters.values.acceptance')
                              : String(value)}
                    </span>
                    <button
                        type="button"
                        onClick={() => onRemove(key)}
                        aria-label={t('semantic_filters.remove', {
                            key: t(FILTER_LABEL_KEYS[key] ?? 'semantic_filters.keys.unknown'),
                        })}
                        data-testid={`semantic-filter-remove-${key}`}
                        className="rounded-full p-0.5 text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                </span>
            ))}
        </section>
    );
}
