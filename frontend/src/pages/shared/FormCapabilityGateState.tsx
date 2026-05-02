import { ShieldAlert } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

interface FormCapabilityGateStateProps {
    state: 'loading' | 'denied';
}

export function FormCapabilityGateState({ state }: FormCapabilityGateStateProps) {
    const { t } = useTranslation(['common']);

    if (state === 'loading') {
        return (
            <div className="flex items-center justify-center h-[40vh]">
                <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-sm text-slate-200">
            <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-amber-300" />
                <span>{t('access.denied')}</span>
            </div>
        </div>
    );
}
