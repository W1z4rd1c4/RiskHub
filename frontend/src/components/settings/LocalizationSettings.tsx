import { Globe, Check, CheckCircle } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/hooks';
import type { SupportedLanguage } from '@/i18n';

interface LanguageOption {
    code: SupportedLanguage;
    name: string;
    nativeName: string;
    flag: string;
}

const languages: LanguageOption[] = [
    {
        code: 'en',
        name: 'English',
        nativeName: 'English',
        flag: '🇬🇧',
    },
    {
        code: 'cs',
        name: 'Czech',
        nativeName: 'Čeština',
        flag: '🇨🇿',
    },
];

export function LocalizationSettings() {
    const { t } = useTranslation('settings');
    const { language, setLanguage } = useLanguage();

    const selectedLang = languages.find(l => l.code === language) || languages[0];

    return (
        <div className="space-y-8">
            {/* Language Selection Section */}
            <section>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <Globe className="h-5 w-5 text-accent" />
                    {t('localization.language')}
                </h3>
                <p className="text-slate-400 text-sm mb-6">
                    {t('localization.language_description')}
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                    {languages.map((lang) => {
                        const isSelected = language === lang.code;

                        return (
                            <button
                                key={lang.code}
                                onClick={() => setLanguage(lang.code)}
                                data-testid={`language-${lang.code}`}
                                className={cn(
                                    "relative flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                                    isSelected
                                        ? "border-accent bg-accent/10"
                                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                                )}
                            >
                                {/* Flag */}
                                <span className="text-3xl">{lang.flag}</span>

                                {/* Labels */}
                                <div className="flex-1">
                                    <span className={cn(
                                        "font-semibold block",
                                        isSelected ? "text-accent" : "text-slate-300"
                                    )}>
                                        {lang.name}
                                    </span>
                                    <span className="text-sm text-slate-500">
                                        {lang.nativeName}
                                    </span>
                                </div>

                                {/* Selected Indicator */}
                                {isSelected && (
                                    <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                                        <Check className="h-4 w-4 text-white" />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Active Translation Notice */}
            <section className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                <div className="flex gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-semibold text-emerald-400 mb-1">
                            {t('localization.active_translation')}
                        </h4>
                        <p className="text-sm text-slate-400">
                            {t('localization.active_translation_message')}
                        </p>
                    </div>
                </div>
            </section>

            {/* Current Selection Confirmation */}
            <section className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{selectedLang.flag}</span>
                    <div>
                        <p className="text-sm text-slate-400">{t('localization.current_preference')}</p>
                        <p className="font-semibold">{selectedLang.name} ({selectedLang.nativeName})</p>
                    </div>
                </div>
            </section>

            {/* Note */}
            <p className="text-xs text-slate-500 italic">
                {t('localization.preference_persistence_note')}
            </p>
        </div>
    );
}
