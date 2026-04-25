import { Save, Trash2 } from 'lucide-react';

import type { KriModalTranslate } from './kriModalTypes';

interface KriModalFooterProps {
    isCreate: boolean;
    isDeleting: boolean;
    isSaving: boolean;
    onClose: () => void;
    onDeleteClick: () => void;
    onSave: () => void;
    showDelete: boolean;
    t: KriModalTranslate;
    validationErrorKey: string | null;
}

export function KriModalFooter({
    isCreate,
    isDeleting,
    isSaving,
    onClose,
    onDeleteClick,
    onSave,
    showDelete,
    t,
    validationErrorKey,
}: KriModalFooterProps) {
    return (
        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
            <div>
                {showDelete ? (
                    <button
                        onClick={onDeleteClick}
                        disabled={isDeleting}
                        className="p-3 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                        title={t('delete_kri', { ns: 'kris' })}
                    >
                        <Trash2 className="h-5 w-5" />
                    </button>
                ) : null}
            </div>
            <div className="flex items-center gap-3">
                <button
                    onClick={onClose}
                    className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
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
                            {isCreate
                                ? t('modal.create_indicator', { ns: 'kris' })
                                : t('actions.save', { ns: 'common' })}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
