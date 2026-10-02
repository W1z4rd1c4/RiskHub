/**
 * ExistingLinksPanel - Display and manage existing risk/control links
 * Extracted from LinkManagementDialog to improve maintainability.
 */

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/state';
import { useTranslation } from '@/i18n/hooks';

import { LinkedItemList, LinkedItemRow, LinkRemoveButton } from './LinkedItemList';
import { buildExistingLinkPresentation } from './linkManagementPresentation';
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
            <h3 className="text-eyebrow flex items-center justify-between">
                <span>{t('common:labels.details')}</span>
                <span className="text-accent-text">{existingLinks.length}</span>
            </h3>

            {existingLinks.length === 0 ? (
                <EmptyState layout="section" title={t('common:empty.no_connections')} />
            ) : (
                <LinkedItemList>
                    {existingLinks.map((link) => {
                        const presentation = buildExistingLinkPresentation(link, mode, t);

                        return (
                            <LinkedItemRow
                                key={link.id}
                                actions={(
                                    <LinkRemoveButton
                                        name={presentation.displayName}
                                        isBusy={isUnlinking === presentation.targetId}
                                        onClick={() => onUnlink(presentation.targetId)}
                                    />
                                )}
                            >
                                <div className="mb-1 flex items-center gap-3">
                                    <span className="truncate text-xs font-bold text-foreground">
                                        {presentation.displayName}
                                    </span>
                                    {showMetadataBadge && presentation.effectiveness ? (
                                        <Badge tone={presentation.effectiveness.tone} size="sm">
                                            {presentation.effectiveness.label}
                                        </Badge>
                                    ) : null}
                                </div>
                                {link.notes && (
                                    <p className="line-clamp-1 text-xs italic text-muted-foreground">"{link.notes}"</p>
                                )}
                            </LinkedItemRow>
                        );
                    })}
                </LinkedItemList>
            )}
        </section>
    );
}
