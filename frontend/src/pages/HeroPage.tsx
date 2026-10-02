import { ArrowRight, BarChart3, Lock, Shield, Zap, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { AuthFrame } from '@/components/layout/AuthFrame';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';

const FEATURES: ReadonlyArray<{ icon: LucideIcon; titleKey: string; descriptionKey: string }> = [
    { icon: Zap, titleKey: 'hero.feature_analytics_title', descriptionKey: 'hero.feature_analytics_desc' },
    { icon: BarChart3, titleKey: 'hero.feature_sii_title', descriptionKey: 'hero.feature_sii_desc' },
    { icon: Shield, titleKey: 'hero.feature_rbac_title', descriptionKey: 'hero.feature_rbac_desc' },
];

/**
 * Public landing page (`/landing`) on the shared public frame (DS-24, D14): the frame owns
 * the wordmark, language switch, `<main>` landmark and OS colour scheme; the card holds the
 * pitch, the primary call to action and the feature list.
 */
export function HeroPage() {
    const navigate = useNavigate();
    const { t } = useTranslation('common');

    return (
        <AuthFrame
            title={t('hero.page_title')}
            subtitle={<p>{t('hero.tagline')} {t('hero.subtitle')}</p>}
            footer={t('hero.footer')}
        >
            <Button variant="accent" size="lg" className="w-full" onClick={() => { void navigate('/'); }}>
                {t('hero.access_platform')}
                <ArrowRight aria-hidden="true" />
            </Button>
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Lock className="size-4 text-success-text" aria-hidden="true" />
                {t('hero.secure_access')}
            </p>
            <ul className="space-y-3">
                {FEATURES.map(({ icon: Icon, titleKey, descriptionKey }) => (
                    <li key={titleKey} className="flex gap-3 rounded-lg border border-border bg-nested p-3">
                        <Icon className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
                        <div className="min-w-0">
                            <h2 className="font-heading text-base font-semibold text-foreground">{t(titleKey)}</h2>
                            <p className="text-sm text-muted-foreground">{t(descriptionKey)}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </AuthFrame>
    );
}

export default HeroPage;
