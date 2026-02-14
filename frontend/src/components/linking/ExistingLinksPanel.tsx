/**
 * ExistingLinksPanel - Display and manage existing risk/control links
 * Extracted from LinkManagementDialog to improve maintainability.
 */

import { Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Existing link item - accepts RiskControlLink or ControlRiskLink shapes */
export interface ExistingLinkItem {
    id: number;
    risk_id?: number;
    control_id?: number;
    effectiveness: string;
    notes?: string;
    // Accepts partial risk object with at least description for display
    risk?: {
        description?: string;
        // Allow additional properties from RiskControlLink
        [key: string]: unknown;
    };
    // Accepts partial control object with at least name for display
    control?: {
        name?: string;
        // Allow additional properties from ControlRiskLink
        [key: string]: unknown;
    };
}

export interface ExistingLinksPanelProps {
    mode: 'control-to-risk' | 'risk-to-control';
    existingLinks: ExistingLinkItem[];
    onUnlink: (targetId: number) => void;
    isUnlinking: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEffectivenessColor(eff: string): string {
    switch (eff) {
        case 'high': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
        case 'medium': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
        case 'low': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
        default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExistingLinksPanel({
    mode,
    existingLinks,
    onUnlink,
    isUnlinking,
}: ExistingLinksPanelProps) {
    const { t } = useTranslation(['common', 'risks', 'controls']);
    const getTargetId = (link: ExistingLinkItem): number => {
        return Number(mode === 'control-to-risk' ? link.risk_id : link.control_id);
    };

    const getDisplayName = (link: ExistingLinkItem): string => {
        if (mode === 'control-to-risk') {
            return link.risk?.description || t('common:labels.unknown');
        }
        return link.control?.name || t('common:labels.unknown');
    };

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
                        const targetId = getTargetId(link);
                        const isCurrentlyUnlinking = isUnlinking === targetId;

                        return (
                            <div
                                key={link.id}
                                className="group p-4 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.05] transition-all"
                            >
                                <div className="flex-1 min-w-0 pr-4">
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="text-xs font-bold text-white truncate">
                                            {getDisplayName(link)}
                                        </span>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border font-mono",
                                            getEffectivenessColor(link.effectiveness)
                                        )}>
                                            {link.effectiveness}
                                        </span>
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
