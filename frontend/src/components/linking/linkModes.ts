import type { ExistingLinkItem, LinkMode } from './linkTypes';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
type HasPermissionFn = (resource: string, action: string) => boolean;

export function getLinkedTargetId(link: ExistingLinkItem, mode: LinkMode): number | undefined {
    switch (mode) {
        case 'control-to-risk':
            return link.risk_id;
        case 'risk-to-control':
            return link.control_id;
        case 'vendor-to-kri':
            return link.kri_id;
    }
}

export function getLinkDialogTitle(
    mode: LinkMode,
    t: TranslateFn,
    options: { title?: string; showSearch: boolean },
): string {
    if (options.title) {
        return options.title;
    }
    if (!options.showSearch) {
        return t('common:empty.no_connections');
    }

    switch (mode) {
        case 'control-to-risk':
            return t('controls:actions.link_risk');
        case 'risk-to-control':
            return t('risks:actions.link_control');
        case 'vendor-to-kri':
            return t('vendors:links.actions.link_existing');
    }
}

export function canUnarchiveLinkTarget(mode: LinkMode, hasPermission: HasPermissionFn): boolean {
    switch (mode) {
        case 'control-to-risk':
            return hasPermission('risks', 'delete');
        case 'risk-to-control':
            return hasPermission('controls', 'delete');
        case 'vendor-to-kri':
            return hasPermission('risks', 'delete');
    }
}
