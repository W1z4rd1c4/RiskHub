import { Plus } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

import { getResultMeta, getResultTitle } from './linkSearchPresentation';
import type { LinkMode, SearchResultItem } from './linkTypes';

interface LinkSearchResultItemProps {
    mode: LinkMode;
    result: SearchResultItem;
    canUnarchive: boolean;
    onSelect: (id: number) => void;
    onUnarchive: (id: number) => Promise<void>;
}

export function LinkSearchResultItem({
    mode,
    result,
    canUnarchive,
    onSelect,
    onUnarchive,
}: LinkSearchResultItemProps) {
    const { t } = useTranslation(['common', 'controls', 'kris', 'risks']);
    const meta = getResultMeta(mode, result, t);

    return (
        <button
            key={result.id}
            onClick={() => onSelect(result.id)}
            className={`w-full flex items-center justify-between px-4 py-3 hover:bg-accent/10 transition-colors text-left group ${result.status === 'archived' ? 'opacity-70' : ''}`}
        >
            <div className="flex flex-col flex-1 min-w-0 pr-4">
                <span className="text-xs font-bold text-white truncate group-hover:text-accent transition-colors text-balance flex items-center gap-2">
                    <span>{getResultTitle(mode, result)}</span>
                    {result.status === 'archived' && (
                        <span className="px-1 py-0.5 rounded bg-white/10 border border-white/10 text-slate-300 text-[9px] uppercase tracking-widest">
                            {t('labels.archived')}
                        </span>
                    )}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">
                    <span className="flex items-center gap-1">
                        {meta.primary}
                        {meta.secondary && (
                            <>
                                <span className="text-slate-700 mx-1">/</span>
                                <span className="text-slate-400 font-medium italic">{meta.secondary}</span>
                            </>
                        )}
                    </span>
                </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
                {result.status === 'archived' && canUnarchive && (
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void onUnarchive(result.id);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                void onUnarchive(result.id);
                            }
                        }}
                        className="px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-[9px] font-black uppercase tracking-widest"
                    >
                        {t('actions.unarchive')}
                    </span>
                )}
                {mode === 'risk-to-control' && (
                    <>
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Level</span>
                            <span className="text-[10px] font-bold text-white">{result.risk_level}/5</span>
                        </div>
                        <div className="flex flex-col items-end min-w-[60px]">
                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest text-right">Freq</span>
                            <span className="text-[10px] font-bold text-white capitalize">{result.frequency}</span>
                        </div>
                    </>
                )}
                <div className="p-1.5 rounded-lg bg-white/5 group-hover:bg-accent/20 transition-colors">
                    <Plus className="h-3 w-3 text-slate-500 group-hover:text-accent" />
                </div>
            </div>
        </button>
    );
}
