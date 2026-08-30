export const APPROVAL_PAGE_SIZE = 100;

export const APPROVAL_TAB_REGISTRY = [
    { value: 'pending', labelKey: 'tabs.pending' },
    { value: 'mine', labelKey: 'tabs.mine' },
    { value: 'risk_assessment', labelKey: 'tabs.risk_assessment' },
    { value: 'all', labelKey: 'tabs.history' },
] as const;

export type ApprovalWorkbenchTab = typeof APPROVAL_TAB_REGISTRY[number]['value'];

export interface ApprovalWorkbenchQueryState {
    tab: ApprovalWorkbenchTab;
    query: string;
    page: number;
    approvalId: number | null;
}

export interface ParsedApprovalWorkbenchQuery {
    state: ApprovalWorkbenchQueryState;
    normalizedParams: URLSearchParams;
    needsNormalization: boolean;
}

export interface ApprovalPageParams {
    limit: number;
    skip: number;
    q?: string;
    status?: 'pending';
    my_requests?: boolean;
}

type ApprovalPageQueryState = Pick<ApprovalWorkbenchQueryState, 'tab' | 'query' | 'page'>;

type ApprovalWorkbenchQueryUpdate =
    | { tab: ApprovalWorkbenchTab }
    | { query: string }
    | { page: number }
    | { approvalId: number | null };

const approvalTabs = new Set<ApprovalWorkbenchTab>(
    APPROVAL_TAB_REGISTRY.map((tab) => tab.value),
);

function isApprovalWorkbenchTab(value: string | null): value is ApprovalWorkbenchTab {
    return value !== null && approvalTabs.has(value as ApprovalWorkbenchTab);
}

function parsePositiveInteger(value: string | null): number | null {
    if (value === null || !/^\d+$/.test(value)) {
        return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseApprovalWorkbenchQuery(
    params: URLSearchParams,
): ParsedApprovalWorkbenchQuery {
    const normalizedParams = new URLSearchParams(params);
    const requestedTab = params.get('tab');
    const tab = isApprovalWorkbenchTab(requestedTab)
        ? requestedTab
        : 'pending';
    if (requestedTab !== tab) {
        normalizedParams.set('tab', tab);
    }

    const query = params.get('q')?.trim() ?? '';
    if (query) {
        normalizedParams.set('q', query);
    } else {
        normalizedParams.delete('q');
    }

    const parsedPage = parsePositiveInteger(params.get('page'));
    const page = parsedPage ?? 1;
    if (page === 1) {
        normalizedParams.delete('page');
    } else {
        normalizedParams.set('page', String(page));
    }

    const approvalId = parsePositiveInteger(params.get('approvalId'));
    if (approvalId === null) {
        normalizedParams.delete('approvalId');
    } else {
        normalizedParams.set('approvalId', String(approvalId));
    }

    return {
        state: { tab, query, page, approvalId },
        normalizedParams,
        needsNormalization: normalizedParams.toString() !== params.toString(),
    };
}

export function updateApprovalWorkbenchQuery(
    current: URLSearchParams,
    update: ApprovalWorkbenchQueryUpdate,
): URLSearchParams {
    const next = new URLSearchParams(current);
    if ('tab' in update) {
        next.set('tab', update.tab);
        next.delete('page');
    } else if ('query' in update) {
        const query = update.query.trim();
        if (query) {
            next.set('q', query);
        } else {
            next.delete('q');
        }
        next.delete('page');
    } else if ('page' in update) {
        if (update.page > 1) {
            next.set('page', String(update.page));
        } else {
            next.delete('page');
        }
    } else if (update.approvalId === null) {
        next.delete('approvalId');
    } else {
        next.set('approvalId', String(update.approvalId));
    }
    return next;
}

export function buildApprovalPageParams(
    state: ApprovalPageQueryState,
): ApprovalPageParams {
    const params: ApprovalPageParams = {
        skip: (state.page - 1) * APPROVAL_PAGE_SIZE,
        limit: APPROVAL_PAGE_SIZE,
    };
    if (state.query) {
        params.q = state.query;
    }
    if (state.tab === 'pending') {
        params.status = 'pending';
    } else if (state.tab === 'mine') {
        params.my_requests = true;
    }
    return params;
}
