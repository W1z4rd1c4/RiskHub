/**
 * ExistingLinksPanel - Display and manage existing risk/control links
 * Extracted from LinkManagementDialog to improve maintainability.
 */

import { Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import {
    getExistingLinkDisplayName,
    getExistingLinkTargetId,
    getMetadataBadgeClassName,
} from './existingLinksPresentation';
import type { ExistingLinkItem, LinkMode } from './linkTypes';

export type { ExistingLinkItem } from './linkTypes';

export interface ExistingLinksPanelProps {
    mode: LinkMode;
    existingLinks: ExistingLinkItem[];
    onUnlink: (targetId: number) => void;
    isUnlinking: number | null;
    showMetadataBadge?: boolean;
}

export function ExistingLinksPanel({
    mode,
    existingLinks,
    onUnlink,
    isUnlinking,
    showMetadataBadge = true,
}: ExistingLinksPanelProps) {
    const { t } = useTranslation(['common', 'controls', 'kris', 'risks']);

    return (
        <section className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                <span>{t('common:labels.details')}</span>
                <span className="text-accent">{existingLinks.length}</span>
            </h3>

            {existingLinks.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                    <AlertCircle className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-600 font-medium tracking-tight">{t('common:empty.no_connections')}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {existingLinks.map((link) => {
                        const targetId = getExistingLinkTargetId(link, mode);
                        const isCurrentlyUnlinking = isUnlinking === targetId;

                        return (
                            <div
                                key={link.id}
                                className="group p-4 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.05] transition-all"
                            >
                                <div className="flex-1 min-w-0 pr-4">
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="text-xs font-bold text-white truncate">
                                            {getExistingLinkDisplayName(link, mode, t)}
                                        </span>
                                        {showMetadataBadge && (
                                            <span className={getMetadataBadgeClassName(link.effectiveness)}>
                                                {link.effectiveness}
                                            </span>
                                        )}
                                    </div>
                                    {link.notes && (
                                        <p className="text-[10px] text-slate-400 italic line-clamp-1">"{link.notes}"</p>
                                    )}
                                </div>
                                <button
                                    onClick={() => onUnlink(targetId)}
                                    disabled={isCurrentlyUnlinking}
                                    className="p-2 text-slate-600 hover:text-rose-500 transition-colors rounded-lg hover:bg-rose-500/10"
                                >
                                    {isCurrentlyUnlinking
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Trash2 className="h-4 w-4" />
                                    }
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
