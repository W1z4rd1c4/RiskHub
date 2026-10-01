import { Sun, Moon, Sparkles, Check } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { PreferenceSyncStatus } from './PreferenceSyncStatus';

export function AppearanceSettings() {
    const { theme, setTheme, syncStatus, retryThemeSync, revertTheme } = useTheme();
    const { t } = useTranslation('settings');

    const themeOptions = [
        {
            value: 'light' as const,
            label: t('appearance.theme_light'),
            description: t('appearance.theme_light_desc'),
            // D2: Light stays "Beta" until the Phase 2 text-token codemod lands
            // (G-RENDER still measures sub-3:1 text in light on harness surfaces).
            betaNote: t('appearance.theme_light_beta_note'),
            icon: Sun,
        },
        {
            value: 'dark' as const,
            label: t('appearance.theme_dark'),
            description: t('appearance.theme_dark_desc'),
            betaNote: null,
            icon: Moon,
        },
        {
            value: 'riskhub' as const,
            label: t('appearance.theme_riskhub'),
            description: t('appearance.theme_riskhub_desc'),
            betaNote: null,
            icon: Sparkles,
        },
    ];

    return (
        <div className="space-y-8">
            {/* Theme Selection Section */}
            <section>
                <fieldset>
                    <legend className="text-lg font-semibold mb-2">{t('appearance.title')}</legend>
                    <p className="text-muted-foreground text-sm mb-6">
                        {t('appearance.description')}
                    </p>

                    <div className="grid gap-4 md:grid-cols-3">
                        {themeOptions.map((option) => {
                            const isSelected = theme === option.value;
                            const Icon = option.icon;
                            const labelId = `appearance-theme-${option.value}-label`;
                            const descriptionId = `appearance-theme-${option.value}-description`;
                            const betaBadgeId = `appearance-theme-${option.value}-beta`;
                            const betaNoteId = `appearance-theme-${option.value}-beta-note`;

                            return (
                                <label
                                    key={option.value}
                                    data-testid={`theme-${option.value}`}
                                    className={cn(
                                        "relative flex cursor-pointer flex-col items-start rounded-xl border-2 p-4 text-left transition-all focus-within:ring-2 focus-within:ring-accent",
                                        isSelected
                                            ? "border-accent bg-accent/10"
                                            : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name="appearance-theme"
                                        value={option.value}
                                        checked={isSelected}
                                        onChange={() => setTheme(option.value)}
                                        aria-labelledby={labelId}
                                        aria-describedby={option.betaNote ? `${descriptionId} ${betaBadgeId} ${betaNoteId}` : descriptionId}
                                        className="sr-only"
                                    />

                                    {/* Selected Indicator */}
                                    {isSelected && (
                                        <div className="absolute top-3 right-3" aria-hidden="true">
                                            <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                                                <Check className="h-3 w-3 text-white" />
                                            </div>
                                        </div>
                                    )}

                                    {/* Icon */}
                                    <div aria-hidden="true" className={cn(
                                        "w-10 h-10 rounded-lg flex items-center justify-center mb-3",
                                        isSelected ? "bg-accent/20" : "bg-white/10"
                                    )}>
                                        <Icon className={cn(
                                            "h-5 w-5",
                                            isSelected ? "text-accent" : "text-slate-400"
                                        )} />
                                    </div>

                                    {/* Label (+ Beta marker, announced through aria-describedby) */}
                                    <span className="mb-1 flex items-center gap-2">
                                        <span id={labelId} className={cn(
                                            "font-semibold",
                                            isSelected ? "text-accent-text" : "text-foreground"
                                        )}>
                                            {option.label}
                                        </span>
                                        {option.betaNote && (
                                            <span
                                                id={betaBadgeId}
                                                data-testid={`theme-${option.value}-beta`}
                                                className="text-xs font-semibold uppercase tracking-wide text-warning-text"
                                            >
                                                {t('appearance.beta_badge')}
                                            </span>
                                        )}
                                    </span>

                                    {/* Description */}
                                    <span id={descriptionId} className="text-xs text-muted-foreground">
                                        {option.description}
                                    </span>
                                    {option.betaNote && (
                                        <span id={betaNoteId} className="mt-2 text-xs text-warning-text">
                                            {option.betaNote}
                                        </span>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
            </section>

            {/* Note */}
            <p className="text-xs text-muted-foreground italic">
                {t('appearance.persistence_note')}
            </p>
            <PreferenceSyncStatus status={syncStatus} onRetry={retryThemeSync} onRevert={revertTheme} />
        </div>
    );
}
