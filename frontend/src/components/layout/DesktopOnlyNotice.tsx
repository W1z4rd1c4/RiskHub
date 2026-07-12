import { Monitor } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

/**
 * FR-P5-2 / finding C6 (ADR-014): desktop-first advisory shown below the `lg`
 * breakpoint (1024px). RiskHub is desktop-only; below `lg` — whether from a narrow
 * viewport or from browser zoom that drops the effective width below the `lg`
 * equivalent — this neutral notice REPLACES the silently-broken layout and points to
 * a path for an accessible alternative.
 *
 * It intentionally does NOT instruct users to reduce zoom: that would ask a low-vision
 * user to disable an accessibility aid. This is a notice, NOT a reflow shell — SC 1.4.4
 * (Resize Text) and 1.4.10 (Reflow) remain documented, accepted AA exceptions under
 * ADR-014.
 */
export function DesktopOnlyNotice() {
    const { t } = useTranslation('layout');
    return (
        <div
            data-testid="desktop-only-notice"
            className="lg:hidden fixed inset-0 z-50 flex items-center justify-center bg-background p-6"
        >
            <div className="glass-card w-full max-w-md space-y-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15">
                    <Monitor className="h-6 w-6 text-accent" aria-hidden="true" />
                </div>
                <h1 className="text-xl font-bold text-white">{t('desktop_only.title')}</h1>
                <p className="text-sm text-slate-300">{t('desktop_only.body')}</p>
                <p className="text-sm text-slate-400">{t('desktop_only.accessible_alternative')}</p>
            </div>
        </div>
    );
}
