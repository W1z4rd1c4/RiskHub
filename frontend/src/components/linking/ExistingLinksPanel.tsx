/**
 * ExistingLinksPanel - Display and manage existing risk/control links
 * Extracted from LinkManagementDialog to improve maintainability.
 */

import { AlertCircle, Unlink } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { buildExistingLinkPresentation } from './linkManagementPresentation';
import type { ExistingLinkItem, LinkMode } from './linkTypes';
import { Spinner } from '@/components/ui/state';

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
            <h3 className="text-xs font-black text-foreground uppercase tracking-widest flex items-center justify-between">
                <span>{t('common:labels.details')}</span>
                <span className="text-accent-text">{existingLinks.length}</span>
            </h3>

            {existingLinks.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-border rounded-2xl bg-tint/[0.01]">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground font-medium tracking-tight">{t('common:empty.no_connections')}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {existingLinks.map((link) => {
                        const presentation = buildExistingLinkPresentation(link, mode, t);
                        const isCurrentlyUnlinking = isUnlinking === presentation.targetId;

                        return (
                            <div
                                key={link.id}
                                className="group p-4 bg-tint/[0.03] border border-border rounded-2xl flex items-center justify-between hover:bg-tint/[0.05] transition-all"
                            >
                                <div className="flex-1 min-w-0 pr-4">
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="text-xs font-bold text-foreground truncate">
                                            {presentation.displayName}
                                        </span>
                                        {showMetadataBadge && (
                                            <span className={presentation.metadataBadgeClassName}>
                                                {link.effectiveness}
                                            </span>
                                        )}
                                    </div>
                                    {link.notes && (
                                        <p className="text-xs text-muted-foreground italic line-clamp-1">"{link.notes}"</p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    aria-label={t('common:links.remove_named', { name: presentation.displayName })}
                                    onClick={() => onUnlink(presentation.targetId)}
                                    disabled={isCurrentlyUnlinking}
                                    className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
                                >
                                    {isCurrentlyUnlinking
                                        ? <Spinner size="sm" className="text-current" />
                                        : <Unlink className="h-4 w-4" aria-hidden="true" />
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
