import { useEffect, useRef, useState, type ReactNode } from 'react';
import { normalizeSupportedLanguage } from '@/i18n';
import { Field } from '@/components/ui/field';
import { useTranslation } from '@/i18n/hooks';
import type { NativeErrorKind } from '@/services/nativeAuthApi';
import { selectLocalLanguage } from '@/utils/userSettingsStorage';

export function NativeFrame({ title, children, error, pending }: {
    title: string; children: ReactNode; error?: NativeErrorKind | 'expired' | null; pending?: boolean;
}) {
    const { t, i18n } = useTranslation('auth');
    const languageFlight = useRef<AbortController | null>(null);
    const [languageError, setLanguageError] = useState(false);
    const [languagePending, setLanguagePending] = useState(false);
    useEffect(() => () => languageFlight.current?.abort(), []);
    const heading = useRef<HTMLHeadingElement>(null);
    const alert = useRef<HTMLParagraphElement>(null);
    useEffect(() => { heading.current?.focus(); }, [title]);
    useEffect(() => { if (error) alert.current?.focus(); }, [error]);
    return <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <section className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 shadow-sm" aria-busy={pending}>
            <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold">{title}</h1>
            {error && <p ref={alert} tabIndex={-1} role="alert" className="text-sm text-destructive">{t(`native.errors.${error}`)}</p>}
            <p role="status" className="text-sm text-muted-foreground">{pending ? t('native.pending') : ''}</p>
            {children}
            <Field label={t('native.language')}>
                {(field) => <select {...field} className="w-full rounded-md border bg-background p-2" value={normalizeSupportedLanguage(i18n.language)} disabled={languagePending} onChange={(event) => {
                    languageFlight.current?.abort();
                    const controller = new AbortController();
                    languageFlight.current = controller;
                    const language = normalizeSupportedLanguage(event.target.value);
                    setLanguagePending(true); setLanguageError(false);
                    void selectLocalLanguage(i18n, language, controller.signal)
                        .catch(() => { if (!controller.signal.aborted) setLanguageError(true); })
                        .finally(() => { if (!controller.signal.aborted) setLanguagePending(false); });
                }}><option value="en">{t('native.english')}</option><option value="cs">{t('native.czech')}</option></select>}
            </Field>
            {languageError && <p role="alert">{t('native.language_error')}</p>}
        </section>
    </main>;
}
