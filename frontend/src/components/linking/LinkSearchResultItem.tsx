import { Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
        <div className="flex w-full items-stretch">
            <Button
                variant="ghost"
                onClick={() => onSelect(result.id)}
                className="group h-auto min-w-0 flex-1 justify-between gap-0 whitespace-normal rounded-none px-4 py-3 text-left font-normal"
            >
                <span className="flex min-w-0 flex-1 flex-col pr-4">
                    <span className="flex items-center gap-2 truncate text-balance text-xs font-bold text-foreground transition-colors group-hover:text-accent-text">
                        <span>{presentation.title}</span>
                        {presentation.isArchived && (
                            <Badge size="sm" tone="neutral">{t('labels.archived')}</Badge>
                        )}
                    </span>
                    <span className="mt-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            {presentation.primaryMeta}
                            {presentation.secondaryMeta && (
                                <>
                                    <span className="mx-1 text-muted-foreground">/</span>
                                    <span className="font-medium italic text-muted-foreground">{presentation.secondaryMeta}</span>
                                </>
                            )}
                        </span>
                    </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                    {mode === 'risk-to-control' && (
                        <>
                            <span className="flex flex-col items-end">
                                <span className="text-eyebrow">{t('linking.risk_level_short')}</span>
                                <span className="text-xs font-bold text-foreground">{result.risk_level}/5</span>
                            </span>
                            <span className="flex min-w-[60px] flex-col items-end">
                                <span className="text-eyebrow text-right">{t('linking.frequency_short')}</span>
                                <span className="text-xs font-bold text-foreground">
                                    {result.frequency
                                        ? t(`controls:frequencies.${result.frequency}`, { defaultValue: result.frequency })
                                        : '—'}
                                </span>
                            </span>
                        </>
                    )}
                    <span className="rounded-lg bg-tint/5 p-1.5 transition-colors group-hover:bg-accent/20">
                        <Plus aria-hidden="true" className="text-muted-foreground group-hover:text-accent-text" />
                    </span>
                </span>
            </Button>
            {presentation.canUnarchive && (
                <Button
                    variant="outline"
                    size="compact"
                    onClick={() => { void onUnarchive(result.id); }}
                    className="m-3 ml-0 self-center"
                >
                    {presentation.unarchiveLabel}
                </Button>
            )}
        </div>
    );
}
