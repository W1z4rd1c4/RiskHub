import { Activity, Plus, X } from 'lucide-react';

import type { KriModalTranslate } from './kriModalTypes';

interface KriModalHeaderProps {
    isCloseDisabled: boolean;
    isCreate: boolean;
    onClose: () => void;
    t: KriModalTranslate;
}

export function KriModalHeader({ isCloseDisabled, isCreate, onClose, t }: KriModalHeaderProps) {
    return (
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-accent/10 rounded-lg">
                    {isCreate ? (
                        <Plus className="h-5 w-5 text-accent" />
                    ) : (
                        <Activity className="h-5 w-5 text-accent" />
                    )}
                </div>
                <div>
                    <h3 className="text-xl font-black text-white">
                        {isCreate ? t('create_kri', { ns: 'kris' }) : t('edit_kri', { ns: 'kris' })}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                        {t('modal.framework', { ns: 'kris' })}
                    </p>
                </div>
            </div>
            <button
                type="button"
                onClick={onClose}
                disabled={isCloseDisabled}
                aria-label={t('actions.close', { ns: 'common' })}
                className="p-2 text-slate-500 hover:text-white transition-colors disabled:cursor-wait disabled:opacity-50"
            >
                <X className="h-6 w-6" />
            </button>
        </div>
    );
}
