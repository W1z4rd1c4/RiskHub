import { useId } from 'react';

import { Button } from '@/components/ui/button';
import type { SupportedLanguage } from '@/i18n';
import { cn } from '@/lib/utils';

/** Display order of the segmented pair; the codes are also the visible button text. */
const LANGUAGES: readonly SupportedLanguage[] = ['cs', 'en'];

export interface LanguageSwitchProps {
    value: SupportedLanguage;
    onChange: (language: SupportedLanguage) => void;
    /** Translated name of the control ("Language"); names the button group. */
    label: string;
    /** Also show `label` as text before the pair (hidden below `sm`). */
    showLabel?: boolean;
    disabled?: boolean;
    className?: string;
}

/**
 * CS / EN language switch for public and pre-auth pages (audit 2026-09-30 §4.20,
 * DS-24 / GAP-C-22): one pattern, an `aria-pressed` segmented `Button` pair inside a
 * named group. The caller owns the language change (`onChange`) so each page keeps
 * its own activation and error handling; colours come from theme tokens only.
 */
export function LanguageSwitch({ value, onChange, label, showLabel = false, disabled = false, className }: LanguageSwitchProps) {
    const labelId = useId();
    return (
        <div className={cn('flex items-center gap-3', className)}>
            {showLabel ? (
                <span id={labelId} className="hidden text-xs font-medium uppercase tracking-widest text-muted-foreground sm:inline">
                    {label}
                </span>
            ) : null}
            <div
                role="group"
                aria-label={showLabel ? undefined : label}
                aria-labelledby={showLabel ? labelId : undefined}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 p-1"
            >
                {LANGUAGES.map((language) => {
                    const active = language === value;
                    return (
                        <Button
                            key={language}
                            variant="ghost"
                            size="compact"
                            aria-pressed={active}
                            disabled={disabled}
                            // Always reported, even for the pressed language: choosing it again
                            // supersedes a still-loading switch to the other one.
                            onClick={() => onChange(language)}
                            className={cn(
                                'min-w-12 rounded-full font-semibold tracking-widest',
                                active
                                    ? 'bg-foreground text-background hover:bg-foreground hover:text-background'
                                    : 'text-muted-foreground',
                            )}
                        >
                            {language.toUpperCase()}
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}
