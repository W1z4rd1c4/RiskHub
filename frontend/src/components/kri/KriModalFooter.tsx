import { Save } from 'lucide-react';

import type { KriModalTranslate } from './kriModalTypes';

interface KriModalFooterProps {
    isSaving: boolean;
    onClose: () => void;
    onSave: () => void;
    t: KriModalTranslate;
    validationErrorKey: string | null;
}

export function KriModalFooter({
    isSaving,
    onClose,
    onSave,
    t,
    validationErrorKey,
}: KriModalFooterProps) {
    return (
        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-end">
            <div className="flex items-center gap-3">
                <button
                    onClick={onClose}
                    disabled={isSaving}
                    className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors disabled:cursor-wait disabled:opacity-50"
                >
                    {t('actions.cancel', { ns: 'common' })}
                </button>
                <button
                    onClick={onSave}
                    disabled={isSaving || validationErrorKey !== null}
                    className="px-8 py-2.5 bg-accent rounded-xl text-slate-950 text-xs font-black uppercase tracking-widest hover:shadow-lg hover:shadow-accent/35 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                    {isSaving ? (
                        t('loading.generic', { ns: 'common' })
                    ) : (
                        <>
                            <Save className="h-4 w-4" />
                            {t('actions.save', { ns: 'common' })}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
