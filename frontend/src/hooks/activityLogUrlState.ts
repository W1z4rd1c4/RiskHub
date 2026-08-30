import type { ActiveTab, ViewMode } from './activityLogPageWorkflow';

export interface ActivityLogUrlState {
    view: ViewMode;
    tab: ActiveTab;
    search: string;
    action: string;
    dateFrom: string;
    dateTo: string;
    actorId: number | null;
    departmentId: number | null;
    riskId: number | null;
    page: number;
}

interface ParseActivityLogUrlStateOptions {
    allowedActions?: readonly string[];
    departmentScopeId?: number;
}

const OWNED_KEYS = [
    'view',
    'tab',
    'q',
    'action',
    'dateFrom',
    'dateTo',
    'actorId',
    'departmentId',
    'riskId',
    'page',
] as const;

const VIEW_MODES: readonly ViewMode[] = ['chronological', 'by_person', 'by_department', 'by_risk'];
const ENTITY_TABS: readonly ActiveTab[] = ['kri', 'risk', 'control', 'user'];

function allowedValue<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
    return raw !== null && allowed.includes(raw as T) ? raw as T : fallback;
}

function positiveInteger(raw: string | null): number | null {
    if (raw === null || !/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function pageNumber(raw: string | null): number {
    return positiveInteger(raw) ?? 1;
}

function isCalendarDate(raw: string | null): raw is string {
    if (raw === null || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
    const [year, month, day] = raw.split('-').map(Number);
    if (month < 1 || month > 12 || day < 1) return false;
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= daysInMonth[month - 1];
}

export function parseActivityLogUrlState(
    params: URLSearchParams,
    { allowedActions, departmentScopeId }: ParseActivityLogUrlStateOptions = {},
): ActivityLogUrlState {
    const view = allowedValue(params.get('view'), VIEW_MODES, 'chronological');
    const requestedAction = params.get('action') ?? '';
    const action = allowedActions === undefined || requestedAction === '' || allowedActions.includes(requestedAction)
        ? requestedAction
        : '';

    return {
        view,
        tab: allowedValue(params.get('tab'), ENTITY_TABS, 'kri'),
        search: params.get('q') ?? '',
        action,
        dateFrom: isCalendarDate(params.get('dateFrom')) ? params.get('dateFrom')! : '',
        dateTo: isCalendarDate(params.get('dateTo')) ? params.get('dateTo')! : '',
        actorId: view === 'by_person' ? positiveInteger(params.get('actorId')) : null,
        departmentId: view === 'by_department'
            ? departmentScopeId ?? positiveInteger(params.get('departmentId'))
            : null,
        riskId: view === 'by_risk' ? positiveInteger(params.get('riskId')) : null,
        page: pageNumber(params.get('page')),
    };
}

export function buildActivityLogUrlParams(
    state: ActivityLogUrlState,
    existingParams = new URLSearchParams(),
): URLSearchParams {
    const params = new URLSearchParams(existingParams);
    OWNED_KEYS.forEach((key) => params.delete(key));

    if (state.view !== 'chronological') params.set('view', state.view);
    if (state.tab !== 'kri') params.set('tab', state.tab);
    if (state.search !== '') params.set('q', state.search);
    if (state.action !== '') params.set('action', state.action);
    if (state.dateFrom !== '') params.set('dateFrom', state.dateFrom);
    if (state.dateTo !== '') params.set('dateTo', state.dateTo);
    if (state.view === 'by_person' && state.actorId !== null) params.set('actorId', String(state.actorId));
    if (state.view === 'by_department' && state.departmentId !== null) {
        params.set('departmentId', String(state.departmentId));
    }
    if (state.view === 'by_risk' && state.riskId !== null) params.set('riskId', String(state.riskId));
    if (state.page > 1) params.set('page', String(state.page));

    return params;
}
