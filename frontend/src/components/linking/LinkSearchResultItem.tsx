import { Plus } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

import { buildLinkSearchResultPresentation } from './linkManagementPresentation';
import type { LinkMode, SearchResultItem } from './linkTypes';

interface LinkSearchResultItemProps {
    mode: LinkMode;
    result: SearchResultItem;
    onSelect: (id: number) => void;
    onUnarchive: (id: number) => Promise<void>;
}

export function LinkSearchResultItem({
    mode,
    result,
    onSelect,
    onUnarchive,
}: LinkSearchResultItemProps) {
    const { t } = useTranslation(['common', 'controls', 'kris', 'risks']);
    const presentation = buildLinkSearchResultPresentation(mode, result, t);

    return (
        <div className="w-full flex items-stretch group">
            <button
                type="button"
                onClick={() => onSelect(result.id)}
                className="min-w-0 flex-1 flex items-center justify-between px-4 py-3 hover:bg-accent/10 transition-colors text-left"
            >
                <span className="flex flex-col flex-1 min-w-0 pr-4">
                <span className="text-xs font-bold text-foreground truncate group-hover:text-accent-text transition-colors text-balance flex items-center gap-2">
                    <span>{presentation.title}</span>
                    {presentation.isArchived && (
                        <span className="px-1 py-0.5 rounded bg-tint/10 border border-border text-foreground text-xs uppercase tracking-widest">
                            {t('labels.archived')}
                        </span>
                    )}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                        {presentation.primaryMeta}
                        {presentation.secondaryMeta && (
                            <>
                                <span className="text-muted-foreground mx-1">/</span>
                                <span className="text-muted-foreground font-medium italic">{presentation.secondaryMeta}</span>
                            </>
                        )}
                    </span>
                </span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                {mode === 'risk-to-control' && (
                    <>
                        <div className="flex flex-col items-end">
                            <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">{t('linking.risk_level_short')}</span>
                            <span className="text-xs font-bold text-foreground">{result.risk_level}/5</span>
                        </div>
                        <div className="flex flex-col items-end min-w-[60px]">
                            <span className="text-xs font-black text-muted-foreground uppercase tracking-widest text-right">{t('linking.frequency_short')}</span>
                            <span className="text-xs font-bold text-foreground capitalize">{result.frequency}</span>
                        </div>
                    </>
                )}
                <span className="p-1.5 rounded-lg bg-tint/5 group-hover:bg-accent/20 transition-colors">
                    <Plus className="h-3 w-3 text-muted-foreground group-hover:text-accent" />
                </span>
                </span>
            </button>
            {presentation.canUnarchive && (
                <button
                    type="button"
                    onClick={() => { void onUnarchive(result.id); }}
                    className="m-3 ml-0 self-center px-2 py-1 rounded-md border border-success/30 text-success-text hover:bg-success/10 text-xs font-black uppercase tracking-widest"
                >
                    {presentation.unarchiveLabel}
                </button>
            )}
        </div>
    );
}
