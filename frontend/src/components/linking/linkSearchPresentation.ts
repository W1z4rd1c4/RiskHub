import type { LinkMode, SearchResultItem } from './linkTypes';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function getSearchPanelHeading(mode: LinkMode, t: TranslateFn): string {
    switch (mode) {
        case 'control-to-risk':
            return `${t('common:actions.create')} ${t('controls:actions.link_risk')}`;
        case 'risk-to-control':
            return `${t('common:actions.create')} ${t('risks:actions.link_control')}`;
        case 'vendor-to-kri':
            return t('vendors:links.actions.link_existing');
    }
}

export function getSearchPlaceholder(mode: LinkMode, t: TranslateFn): string {
    switch (mode) {
        case 'control-to-risk':
            return t('filters.search_risks');
        case 'risk-to-control':
            return t('filters.search_controls');
        case 'vendor-to-kri':
            return t('filters.search_kris');
    }
}

export function getEmptyResultsLabel(mode: LinkMode, t: TranslateFn): string {
    switch (mode) {
        case 'control-to-risk':
            return t('common:empty.no_risks_found');
        case 'risk-to-control':
            return t('common:empty.no_controls_found');
        case 'vendor-to-kri':
            return t('common:empty.no_kris_found');
    }
}

export function getResultTitle(mode: LinkMode, result: SearchResultItem): string | null | undefined {
    return mode === 'control-to-risk' ? result.description : result.name;
}

export function getResultMeta(mode: LinkMode, result: SearchResultItem, t: TranslateFn) {
    if (mode === 'control-to-risk') {
        return {
            primary: result.process,
            secondary: null,
        };
    }

    if (mode === 'vendor-to-kri') {
        return {
            primary: result.process || t('common:fallbacks.not_available'),
            secondary: result.department_name,
        };
    }

    return {
        primary: result.department?.name,
        secondary: result.control_owner_name,
    };
}
