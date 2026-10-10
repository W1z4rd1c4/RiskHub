import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';

/**
 * One selectable risk in the Control and KRI "link a risk" pickers (DS-10,
 * PG-41): a `Button` row with the name, process and a CSS-clamped description
 * (the full text stays in the tooltip), instead of two copied raw buttons that
 * cut the description with `slice()+'...'`.
 */
export interface RiskPickerOptionProps {
    risk: { name: string; process?: string | null; description?: string | null };
    onSelect: () => void;
    'data-testid'?: string;
}

export function RiskPickerOption({ risk, onSelect, 'data-testid': testId }: RiskPickerOptionProps) {
    const { t } = useTranslation('common');
    return (
        <Button
            variant="ghost"
            onClick={onSelect}
            data-testid={testId}
            className="group h-auto w-full items-stretch justify-start gap-2 whitespace-normal rounded-none p-2 text-left font-normal"
        >
            <span className="flex w-[200px] shrink-0 flex-col justify-center rounded-lg bg-tint/5 p-3 transition-colors group-hover:bg-tint/10">
                <span className="block truncate text-sm font-bold text-foreground" title={risk.name}>{risk.name}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground" title={risk.process ?? undefined}>{risk.process}</span>
            </span>
            <span className="flex min-w-0 flex-1 items-center rounded-lg bg-tint/5 p-3 transition-colors group-hover:bg-tint/10">
                {risk.description ? (
                    <span className="line-clamp-3 text-xs leading-tight text-muted-foreground" title={risk.description}>
                        {risk.description}
                    </span>
                ) : (
                    <span className="text-xs italic text-muted-foreground">{t('empty.no_description')}</span>
                )}
            </span>
        </Button>
    );
}
