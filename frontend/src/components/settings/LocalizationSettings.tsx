import { useId } from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { useLanguage } from '@/i18n/hooks';
import type { SupportedLanguage } from '@/i18n';
import { InlineMessage } from '@/components/ui/inline-message';
import { RadioGroup, type RadioGroupOption } from '@/components/ui/radio-group';
import { PreferenceSyncStatus } from './PreferenceSyncStatus';

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
    const { language, setLanguage, syncStatus, retryLanguageSync, revertLanguage } = useLanguage();
    const headingId = useId();

    const selectedLang = languages.find(l => l.code === language) || languages[0];

    // GAP-C-15: a native radio group exposes the selected language (`checked`),
    // and the flag emoji is decorative (`aria-hidden`), so it is not read aloud.
    const languageOptions: RadioGroupOption<SupportedLanguage>[] = languages.map((lang) => ({
        value: lang.code,
        label: (
            <span className="flex items-center gap-4">
                <span aria-hidden="true" className="text-3xl">{lang.flag}</span>
                <span>{lang.name}</span>
            </span>
        ),
        description: lang.nativeName,
        testId: `language-${lang.code}`,
    }));

    return (
        <div className="space-y-8">
            {/* Language Selection Section */}
            <section>
                <h2 id={headingId} className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <Globe aria-hidden="true" className="h-5 w-5 text-accent-text" />
                    {t('localization.language')}
                </h2>
                <p className="text-muted-foreground text-sm mb-6">
                    {t('localization.language_description')}
                </p>

                <RadioGroup<SupportedLanguage>
                    variant="card"
                    aria-labelledby={headingId}
                    value={language}
                    onValueChange={setLanguage}
                    options={languageOptions}
                    className="grid gap-4 space-y-0 md:grid-cols-2"
                />
            </section>

            {/* Active Translation Notice */}
            <InlineMessage tone="success" title={t('localization.active_translation')}>
                {t('localization.active_translation_message')}
            </InlineMessage>

            {/* Current Selection Confirmation */}
            <section className="bg-tint/5 border border-border rounded-xl p-4">
                <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="text-2xl">{selectedLang.flag}</span>
                    <div>
                        <p className="text-sm text-muted-foreground">{t('localization.current_preference')}</p>
                        <p className="font-semibold">{selectedLang.name} ({selectedLang.nativeName})</p>
                    </div>
                </div>
            </section>

            {/* Note */}
            <p className="text-xs text-muted-foreground italic">
                {t('localization.preference_persistence_note')}
            </p>
            <PreferenceSyncStatus
                status={syncStatus}
                onRetry={retryLanguageSync}
                onRevert={revertLanguage}
            />
        </div>
    );
}
