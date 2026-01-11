import { Sun, Moon, Sparkles, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

export function AppearanceSettings() {
    const { theme, setTheme } = useTheme();
    const { t } = useTranslation('settings');

    const themeOptions = [
        {
            value: 'light' as const,
            label: t('appearance.theme_light'),
            description: t('appearance.theme_light_desc'),
            icon: Sun,
        },
        {
            value: 'dark' as const,
            label: t('appearance.theme_dark'),
            description: t('appearance.theme_dark_desc'),
            icon: Moon,
        },
        {
            value: 'riskhub' as const,
            label: t('appearance.theme_riskhub'),
            description: t('appearance.theme_riskhub_desc'),
            icon: Sparkles,
        },
    ];

    return (
        <div className="space-y-8">
            {/* Theme Selection Section */}
            <section>
                <h3 className="text-lg font-semibold mb-2">{t('appearance.title')}</h3>
                <p className="text-slate-400 text-sm mb-6">
                    {t('appearance.description')}
                </p>

                <div className="grid gap-4 md:grid-cols-3">
                    {themeOptions.map((option) => {
                        const isSelected = theme === option.value;
                        const Icon = option.icon;

                        return (
                            <button
                                key={option.value}
                                onClick={() => setTheme(option.value)}
                                className={cn(
                                    "relative flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left",
                                    isSelected
                                        ? "border-accent bg-accent/10"
                                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                                )}
                            >
                                {/* Selected Indicator */}
                                {isSelected && (
                                    <div className="absolute top-3 right-3">
                                        <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                                            <Check className="h-3 w-3 text-white" />
                                        </div>
                                    </div>
                                )}

                                {/* Icon */}
                                <div className={cn(
                                    "w-10 h-10 rounded-lg flex items-center justify-center mb-3",
                                    isSelected ? "bg-accent/20" : "bg-white/10"
                                )}>
                                    <Icon className={cn(
                                        "h-5 w-5",
                                        isSelected ? "text-accent" : "text-slate-400"
                                    )} />
                                </div>

                                {/* Label */}
                                <span className={cn(
                                    "font-semibold mb-1",
                                    isSelected ? "text-accent" : "text-slate-300"
                                )}>
                                    {option.label}
                                </span>

                                {/* Description */}
                                <span className="text-xs text-slate-500">
                                    {option.description}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Note */}
            <p className="text-xs text-slate-500 italic">
                {t('appearance.persistence_note')}
            </p>
        </div>
    );
}

