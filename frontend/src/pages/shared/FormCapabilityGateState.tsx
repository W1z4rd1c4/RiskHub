import { ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';

interface FormCapabilityGateStateProps {
    state: 'loading' | 'denied' | 'error';
    onRetry?: () => void;
}

export function FormCapabilityGateState({ state, onRetry }: FormCapabilityGateStateProps) {
    const { t } = useTranslation(['common']);

    if (state === 'loading') {
        return (
            <div role="status" aria-busy="true" className="flex items-center justify-center gap-3 h-[40vh] text-foreground">
                <div aria-hidden="true" className="w-8 h-8 border-4 border-current border-t-transparent rounded-full animate-spin" />
                <span>{t('access.checking')}</span>
            </div>
        );
    }

    return (
        <div role="alert" className="rounded-2xl border border-border bg-card px-5 py-6 text-sm text-foreground">
            <div className="flex items-center gap-3">
                <ShieldAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
                <span>{t(state === 'error' ? 'access.check_failed' : 'access.denied')}</span>
                {state === 'error' && <Button variant="outline" className="text-foreground hover:bg-muted" onClick={onRetry}>{t('actions.retry')}</Button>}
            </div>
        </div>
    );
}
