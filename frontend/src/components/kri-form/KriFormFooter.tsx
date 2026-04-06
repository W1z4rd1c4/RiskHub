import { Save, X } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

interface KriFormFooterProps {
    cancelLabel: string;
    currentStep: number;
    isEdit: boolean;
    isSubmitting: boolean;
    onBack: () => void;
    onCancel: () => void;
    onNext: () => void;
}

export function KriFormFooter({
    cancelLabel,
    currentStep,
    isEdit,
    isSubmitting,
    onBack,
    onCancel,
    onNext,
}: KriFormFooterProps) {
    const { t } = useTranslation(['common', 'kris']);

    return (
        <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-8">
            {currentStep === 0 ? (
                <>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 transition-colors hover:text-white"
                    >
                        <X className="h-4 w-4" />
                        {cancelLabel}
                    </button>
                    <button type="button" onClick={onNext} className="btn-primary">
                        {t('common:actions.next')}
                    </button>
                </>
            ) : (
                <>
                    <button
                        type="button"
                        onClick={onBack}
                        className="text-sm font-bold text-slate-400 transition-colors hover:text-white"
                    >
                        {t('common:actions.back')}
                    </button>
                    <button type="submit" disabled={isSubmitting} className="btn-primary px-8">
                        {isSubmitting
                            ? t('common:loading.generic')
                            : isEdit
                                ? t('kris:edit_kri')
                                : t('kris:create_kri')}
                        <Save className="h-4 w-4" />
                    </button>
                </>
            )}
        </div>
    );
}
