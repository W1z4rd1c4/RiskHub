import { AccessDeniedState, ErrorState, LoadingState } from '@/components/ui/state';
import { useTranslation } from '@/i18n/hooks';
import type { Namespace } from '@/i18n/types';

interface FormCapabilityGateStateProps {
    state: 'loading' | 'denied' | 'error';
    onRetry?: () => void;
    /** Module-specific denial text; defaults to the shared `errors.forbidden`. */
    deniedDescriptionKey?: string;
    deniedNs?: Namespace;
}

/** Create-page capability gate: one shared state per outcome (DS-17, §4.15). */
export function FormCapabilityGateState({
    state,
    onRetry,
    deniedDescriptionKey,
    deniedNs,
}: FormCapabilityGateStateProps) {
    const { t } = useTranslation(['common']);

    if (state === 'loading') {
        return <LoadingState layout="section" label={t('access.checking')} />;
    }

    if (state === 'error') {
        return <ErrorState layout="section" messageKey="access.check_failed" onRetry={onRetry} />;
    }

    // The denial replaces the access check (or a retried error) already on
    // screen, so it is announced like the error state (role="alert").
    return <AccessDeniedState layout="section" live descriptionKey={deniedDescriptionKey} ns={deniedNs} />;
}
