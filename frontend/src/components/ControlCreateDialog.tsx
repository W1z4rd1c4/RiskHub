import { useId } from 'react';
import { X, ShieldPlus } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { DialogShell } from './DialogShell';
import { ControlForm } from './control-form/ControlFormContainer';

interface ControlCreateDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (controlId: number) => void;
}

export function ControlCreateDialog({ isOpen, onClose, onSuccess }: ControlCreateDialogProps) {
    const { t } = useTranslation(['controls', 'common']);
    const titleId = useId();

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={onClose}
            titleId={titleId}
            containerClassName="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-8"
            backdropClassName="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            contentClassName="w-full max-w-4xl max-h-[90vh] bg-slate-900/95 backdrop-blur-xl rounded-2xl overflow-hidden flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-accent/20 p-2 rounded-lg">
                        <ShieldPlus className="h-5 w-5 text-accent" />
                    </div>
                    <h2 id={titleId} className="text-xl font-black text-white uppercase tracking-tight">
                        {t('controls:create_control')}
                    </h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                    title={t('common:actions.close')}
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Scrollable Form Container */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar min-h-0">
                <ControlForm
                    onSuccess={onSuccess}
                    onCancel={onClose}
                />
            </div>
        </DialogShell>
    );
}
