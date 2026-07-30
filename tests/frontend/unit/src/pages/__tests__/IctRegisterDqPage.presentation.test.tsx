import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    DQ_STATUS_FINDING,
    DQ_STATUS_OK,
    dqAreaKey,
    dqSeverityKey,
    filterChecks,
    isFinding,
    isProductionInert,
    localizeRegisterRowLabel,
    parseDqPageQueryParams,
    summarizeChecks,
    violatingRowPath,
} from '@/pages/ictRegisterDq/dqPresentation';
import type { IctDqCheck } from '@/types/ictRegisterDq';

const getDataQuality = vi.fn();
const getViolations = vi.fn();

vi.mock('@/services/ictRegisterDqApi', () => ({
    ictRegisterDqApi: {
        getDataQuality: (...args: unknown[]) => getDataQuality(...args),
        getViolations: (...args: unknown[]) => getViolations(...args),
    },
}));

function sampleCheck(overrides: Partial<IctDqCheck> = {}): IctDqCheck {
    const check = {
        check_id: 'DQ-01',
        area: 'Procesy',
        title_cs: 'Proces bez vlastníka',
        severity: 'Vysoká',
        threshold: 0,
        count: 0,
        status: DQ_STATUS_OK,
        violating_rows: [],
        ...overrides,
    };
    return {
        ...check,
        visible_count: overrides.visible_count ?? check.violating_rows.length,
        violating_rows_truncated: overrides.violating_rows_truncated ?? false,
    };
}

describe('ICT Register DQ presentation helpers', () => {
    it('maps the workbook CZ areas and severities onto stable i18n keys', () => {
        expect(dqAreaKey('Procesy')).toBe('processes');
        expect(dqAreaKey('Aktiva')).toBe('assets');
        expect(dqAreaKey('Vazby')).toBe('links');
        expect(dqAreaKey('Dodavatelé')).toBe('vendors');
        expect(dqAreaKey('Rizika')).toBe('risks');
        expect(dqAreaKey('Integrita')).toBe('integrity');
        expect(dqAreaKey('Smlouvy')).toBe('contracts');
        expect(dqAreaKey('Neznámá')).toBeNull();

        expect(dqSeverityKey('Kritická')).toBe('critical');
        expect(dqSeverityKey('Vysoká')).toBe('high');
        expect(dqSeverityKey('Střední')).toBe('medium');
        expect(dqSeverityKey('Jiná')).toBeNull();
    });

    it('routes violating rows to their register detail pages', () => {
        const row = {
            entity_type: 'contract',
            entity_id: 12,
            label: 'SML-2020-001',
            route_entity_type: 'vendor',
            route_entity_id: 3,
        };
        expect(violatingRowPath(row)).toBe('/vendors/3');
        expect(
            violatingRowPath({ ...row, route_entity_type: 'process', route_entity_id: 7 })
        ).toBe('/processes/7');
        expect(violatingRowPath({ ...row, route_entity_type: 'asset', route_entity_id: 8 })).toBe(
            '/assets/8'
        );
        expect(violatingRowPath({ ...row, route_entity_type: 'risk', route_entity_id: 9 })).toBe(
            '/risks/9'
        );
        expect(violatingRowPath({ ...row, route_entity_type: 'unknown' })).toBeNull();
    });

    it('localizes {{unknown_<entity>}} label tokens to the guardrail fallback, never a raw id', () => {
        const t = (key: string) =>
            key === 'common:fallbacks.unknown_contract' ? 'Unknown contract' : key;
        // A genuinely-absent business label arrives as a token, resolved to
        // "Unknown <entity>"; the workbook "?" for the dangling end stays.
        expect(localizeRegisterRowLabel('{{unknown_contract}} → ?', t)).toBe('Unknown contract → ?');
        // Real business labels pass through untouched.
        expect(localizeRegisterRowLabel('SML-2020-001', t)).toBe('SML-2020-001');
    });

    it('filters to findings and summarizes counts', () => {
        const checks = [
            sampleCheck(),
            sampleCheck({
                check_id: 'DQ-16',
                status: DQ_STATUS_FINDING,
                count: 2,
                violating_rows: [
                    {
                        entity_type: 'vendor',
                        entity_id: 3,
                        label: 'BIZ DATA',
                        route_entity_type: 'vendor',
                        route_entity_id: 3,
                    },
                    {
                        entity_type: 'vendor',
                        entity_id: 4,
                        label: 'Cloud s.r.o.',
                        route_entity_type: 'vendor',
                        route_entity_id: 4,
                    },
                ],
            }),
        ];

        expect(checks.map(isFinding)).toEqual([false, true]);
        expect(filterChecks(checks, 'all')).toHaveLength(2);
        expect(filterChecks(checks, 'findings').map((check) => check.check_id)).toEqual(['DQ-16']);
        expect(summarizeChecks(checks)).toEqual({
            total: 2,
            findings: 1,
            ok: 1,
            notMeasurable: 0,
            violatingRowCount: 2,
        });
    });

    it('marks production-inert quiet checks as not-yet-measurable, never a firing one', () => {
        const inertQuiet = sampleCheck({ check_id: 'DQ-23', production_inert: true });
        const inertFiring = sampleCheck({
            check_id: 'DQ-23',
            production_inert: true,
            status: DQ_STATUS_FINDING,
            count: 1,
        });
        const plainOk = sampleCheck();

        expect(isProductionInert(inertQuiet)).toBe(true);
        // A firing check is always a finding — the muted state never masks it.
        expect(isProductionInert(inertFiring)).toBe(false);
        expect(isProductionInert(plainOk)).toBe(false);

        // The summary counts it apart from the passing checks.
        expect(summarizeChecks([inertQuiet, plainOk])).toEqual({
            total: 2,
            findings: 0,
            ok: 1,
            notMeasurable: 1,
            violatingRowCount: 0,
        });
    });

    it('parses committee drill-down deep links (?check= and ?status=)', () => {
        // The committee page (#51) drills its DQ-equivalent tiles into this
        // page pre-focused on the producing check or the findings filter.
        expect(parseDqPageQueryParams(new URLSearchParams('check=DQ-09'))).toEqual({
            statusFilter: 'all',
            expandedCheckId: 'DQ-09',
            detailOffset: 0,
        });
        expect(parseDqPageQueryParams(new URLSearchParams('status=findings'))).toEqual({
            statusFilter: 'findings',
            expandedCheckId: null,
            detailOffset: 0,
        });
        expect(parseDqPageQueryParams(new URLSearchParams('status=bogus&check='))).toEqual({
            statusFilter: 'all',
            expandedCheckId: null,
            detailOffset: 0,
        });
        expect(
            parseDqPageQueryParams(new URLSearchParams('check=DQ-16&dq_offset=75'))
        ).toEqual({
            statusFilter: 'all',
            expandedCheckId: 'DQ-16',
            detailOffset: 50,
        });
    });
});

describe('IctRegisterDqPage', () => {
    beforeEach(() => {
        getViolations.mockReset();
    });

    it('loads bounded violation details only after expansion and paginates them', async () => {
        getDataQuality.mockResolvedValue({
            checks: [
                sampleCheck({
                    check_id: 'DQ-16',
                    status: DQ_STATUS_FINDING,
                    count: 51,
                    visible_count: 51,
                    violating_rows_truncated: true,
                    violating_rows: [
                        {
                            entity_type: 'vendor',
                            entity_id: 3,
                            label: 'Preview only',
                            route_entity_type: 'vendor',
                            route_entity_id: 3,
                        },
                    ],
                }),
            ],
            finding_count: 1,
        });
        getViolations
            .mockResolvedValueOnce({
                items: [
                    {
                        entity_type: 'vendor',
                        entity_id: 4,
                        label: 'First detail page',
                        route_entity_type: 'vendor',
                        route_entity_id: 4,
                    },
                ],
                total: 51,
                offset: 0,
                limit: 50,
            })
            .mockResolvedValueOnce({
                items: [
                    {
                        entity_type: 'vendor',
                        entity_id: 54,
                        label: 'Second detail page',
                        route_entity_type: 'vendor',
                        route_entity_id: 54,
                    },
                ],
                total: 51,
                offset: 50,
                limit: 50,
            });

        const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
        render(
            <MemoryRouter>
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        const check = await screen.findByTestId('dq-check-DQ-16');
        expect(getViolations).not.toHaveBeenCalled();
        fireEvent.click(check);
        await waitFor(() => {
            expect(getViolations).toHaveBeenCalledWith('DQ-16', { offset: 0, limit: 50 });
        });
        expect(await screen.findByRole('link', { name: /First detail page/ })).toHaveAttribute(
            'href',
            '/vendors/4'
        );
        expect(screen.queryByText('Preview only')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /next/i }));
        await waitFor(() => {
            expect(getViolations).toHaveBeenLastCalledWith('DQ-16', { offset: 50, limit: 50 });
        });
        expect(await screen.findByRole('link', { name: /Second detail page/ })).toHaveAttribute(
            'href',
            '/vendors/54'
        );
    });

    it('keeps only the active page when same-check requests resolve out of order', async () => {
        getDataQuality.mockResolvedValue({
            checks: [
                sampleCheck({
                    check_id: 'DQ-16',
                    status: DQ_STATUS_FINDING,
                    count: 101,
                    visible_count: 101,
                    violating_rows_truncated: true,
                }),
            ],
            finding_count: 1,
        });
        let resolveFirst: ((value: unknown) => void) | undefined;
        let resolveSecond: ((value: unknown) => void) | undefined;
        getViolations
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveFirst = resolve;
                    })
            )
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveSecond = resolve;
                    })
            );

        const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
        function NavigateToSecondPage() {
            const navigate = useNavigate();
            return (
                <button
                    type="button"
                    onClick={() =>
                        navigate('/ict-register/data-quality?check=DQ-16&dq_offset=50')
                    }
                >
                    Go to second page
                </button>
            );
        }
        render(
            <MemoryRouter
                initialEntries={['/ict-register/data-quality?check=DQ-16&dq_offset=0']}
            >
                <NavigateToSecondPage />
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        await waitFor(() => expect(getViolations).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Go to second page' }));
        await waitFor(() => expect(getViolations).toHaveBeenCalledTimes(2));

        await act(async () => {
            resolveSecond?.({
                items: [
                    {
                        entity_type: 'vendor',
                        entity_id: 50,
                        label: 'Current second page',
                        route_entity_type: 'vendor',
                        route_entity_id: 50,
                    },
                ],
                total: 101,
                offset: 50,
                limit: 50,
            });
        });
        expect(await screen.findByText('Current second page')).toBeInTheDocument();

        await act(async () => {
            resolveFirst?.({
                items: [
                    {
                        entity_type: 'vendor',
                        entity_id: 1,
                        label: 'Stale first page',
                        route_entity_type: 'vendor',
                        route_entity_id: 1,
                    },
                ],
                total: 101,
                offset: 0,
                limit: 50,
            });
        });
        expect(screen.getByText('Current second page')).toBeInTheDocument();
        expect(screen.queryByText('Stale first page')).not.toBeInTheDocument();
    });

    it.each([
        {
            initialOffset: 1000,
            responseTotal: 100,
            expectedOffset: 50,
            label: 'last valid page',
        },
        {
            initialOffset: 1000,
            responseTotal: 0,
            expectedOffset: 0,
            label: 'empty result',
        },
    ])(
        'normalizes an impossible offset to the $label',
        async ({ initialOffset, responseTotal, expectedOffset }) => {
            getDataQuality.mockResolvedValue({
                checks: [
                    sampleCheck({
                        check_id: 'DQ-16',
                        status: DQ_STATUS_FINDING,
                        count: Math.max(responseTotal, 1),
                        visible_count: Math.max(responseTotal, 1),
                        violating_rows_truncated: true,
                    }),
                ],
                finding_count: 1,
            });
            getViolations
                .mockResolvedValueOnce({
                    items: [],
                    total: responseTotal,
                    offset: initialOffset,
                    limit: 50,
                })
                .mockResolvedValueOnce({
                    items: [],
                    total: responseTotal,
                    offset: expectedOffset,
                    limit: 50,
                });

            const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
            render(
                <MemoryRouter
                    initialEntries={[
                        `/ict-register/data-quality?check=DQ-16&dq_offset=${initialOffset}`,
                    ]}
                >
                    <IctRegisterDqPage />
                </MemoryRouter>
            );

            await waitFor(() => expect(getViolations).toHaveBeenCalledTimes(2));
            expect(getViolations).toHaveBeenNthCalledWith(1, 'DQ-16', {
                offset: initialOffset,
                limit: 50,
            });
            expect(getViolations).toHaveBeenNthCalledWith(2, 'DQ-16', {
                offset: expectedOffset,
                limit: 50,
            });
        }
    );

    it('replaces an impossible offset so Back returns to the previous location', async () => {
        getDataQuality.mockResolvedValue({
            checks: [
                sampleCheck({
                    check_id: 'DQ-16',
                    status: DQ_STATUS_FINDING,
                    count: 100,
                    visible_count: 100,
                    violating_rows_truncated: true,
                }),
            ],
            finding_count: 1,
        });
        getViolations.mockImplementation((_checkId, { offset }) =>
            Promise.resolve({
                items: [],
                total: 100,
                offset,
                limit: 50,
            })
        );
        function HistoryProbe() {
            const location = useLocation();
            const navigate = useNavigate();
            return (
                <>
                    <output data-testid="history-location">
                        {location.pathname}
                        {location.search}
                    </output>
                    <button type="button" onClick={() => navigate(-1)}>
                        Back
                    </button>
                </>
            );
        }

        const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
        render(
            <MemoryRouter
                initialEntries={[
                    '/previous-location',
                    '/ict-register/data-quality?check=DQ-16&dq_offset=1000',
                ]}
                initialIndex={1}
            >
                <HistoryProbe />
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('history-location')).toHaveTextContent(
                '/ict-register/data-quality?check=DQ-16&dq_offset=50'
            );
        });
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        await waitFor(() => {
            expect(screen.getByTestId('history-location')).toHaveTextContent(
                '/previous-location'
            );
        });
    });

    it('rewrites a misaligned dq_offset in the URL before showing the aligned page', async () => {
        getDataQuality.mockResolvedValue({
            checks: [
                sampleCheck({
                    check_id: 'DQ-16',
                    status: DQ_STATUS_FINDING,
                    count: 101,
                    visible_count: 101,
                    violating_rows_truncated: true,
                }),
            ],
            finding_count: 1,
        });
        getViolations.mockResolvedValue({
            items: [],
            total: 101,
            offset: 50,
            limit: 50,
        });
        function LocationSearch() {
            return <output data-testid="location-search">{useLocation().search}</output>;
        }

        const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
        render(
            <MemoryRouter
                initialEntries={['/ict-register/data-quality?check=DQ-16&dq_offset=75']}
            >
                <LocationSearch />
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('location-search')).toHaveTextContent('dq_offset=50');
        });
        expect(getViolations).toHaveBeenCalledWith('DQ-16', { offset: 50, limit: 50 });
    });

    it('exposes disclosure state and its controlled panel to assistive technology', async () => {
        getDataQuality.mockResolvedValue({
            checks: [
                sampleCheck({
                    check_id: 'DQ-16',
                    status: DQ_STATUS_FINDING,
                    count: 1,
                    visible_count: 1,
                }),
            ],
            finding_count: 1,
        });
        getViolations.mockResolvedValue({
            items: [],
            total: 0,
            offset: 0,
            limit: 50,
        });

        const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
        render(
            <MemoryRouter>
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        const disclosure = await screen.findByTestId('dq-check-DQ-16');
        expect(disclosure).toHaveAttribute('aria-expanded', 'false');
        expect(disclosure).toHaveAttribute('aria-controls', 'dq-panel-DQ-16');
        const controlledPanel = document.getElementById('dq-panel-DQ-16');
        expect(controlledPanel).toBeInTheDocument();
        expect(controlledPanel).toHaveAttribute('hidden');
        expect(screen.queryByText('No visible violating rows.')).not.toBeInTheDocument();

        fireEvent.click(disclosure);
        expect(disclosure).toHaveAttribute('aria-expanded', 'true');
        expect(await screen.findByTestId('dq-rows-DQ-16')).toBe(controlledPanel);
        expect(controlledPanel).not.toHaveAttribute('hidden');
    });

    it('restores a deep-linked page offset and supports loading, retry, and empty states', async () => {
        getDataQuality.mockResolvedValue({
            checks: [
                sampleCheck({
                    check_id: 'DQ-16',
                    status: DQ_STATUS_FINDING,
                    count: 51,
                    visible_count: 51,
                    violating_rows_truncated: true,
                    violating_rows: [],
                }),
            ],
            finding_count: 1,
        });
        let rejectFirstRequest: ((reason?: unknown) => void) | undefined;
        getViolations
            .mockImplementationOnce(
                () =>
                    new Promise((_, reject) => {
                        rejectFirstRequest = reject;
                    })
            )
            .mockResolvedValueOnce({
                items: [],
                total: 51,
                offset: 50,
                limit: 50,
            });

        const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
        render(
            <MemoryRouter
                initialEntries={['/ict-register/data-quality?check=DQ-16&dq_offset=50']}
            >
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        expect(await screen.findByRole('status')).toHaveTextContent('Loading violation details');
        expect(getViolations).toHaveBeenCalledWith('DQ-16', { offset: 50, limit: 50 });

        await act(async () => {
            rejectFirstRequest?.(new Error('network failure'));
        });
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Violation details could not be loaded.'
        );

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => {
            expect(getViolations).toHaveBeenCalledTimes(2);
        });
        expect(getViolations).toHaveBeenLastCalledWith('DQ-16', { offset: 50, limit: 50 });
        expect(await screen.findByText('No visible violating rows.')).toBeInTheDocument();
    });

    it('lists checks with status pills and drills down to violating-row links', async () => {
        getViolations.mockResolvedValue({
            items: [
                {
                    entity_type: 'vendor',
                    entity_id: 3,
                    label: 'BIZ DATA',
                    route_entity_type: 'vendor',
                    route_entity_id: 3,
                },
            ],
            total: 1,
            offset: 0,
            limit: 50,
        });
        getDataQuality.mockResolvedValue({
            checks: [
                sampleCheck(),
                sampleCheck({
                    check_id: 'DQ-23',
                    area: 'Rizika',
                    title_cs: 'Posouzení rizika po termínu',
                    production_inert: true,
                    production_inert_reason:
                        'The app Risk register tracks no assessment date or materiality; the loader maps them empty, so this check cannot fire on production data.',
                }),
                sampleCheck({
                    check_id: 'DQ-16',
                    area: 'Dodavatelé',
                    title_cs: 'Kritický/Významný dodavatel bez ID kódu',
                    severity: 'Vysoká',
                    status: DQ_STATUS_FINDING,
                    count: 1,
                    violating_rows: [
                        {
                            entity_type: 'vendor',
                            entity_id: 3,
                            label: 'BIZ DATA',
                            route_entity_type: 'vendor',
                            route_entity_id: 3,
                        },
                    ],
                }),
            ],
            finding_count: 1,
        });

        const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
        render(
            <MemoryRouter>
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        // The EN gloss titles come from the bilingual ictRegisterDq namespace.
        expect(await screen.findByText('Process without an owner')).toBeInTheDocument();
        expect(screen.getByText('Critical/Significant vendor without an ID code')).toBeInTheDocument();

        // Status pills: one OK, one Finding; the production-inert quiet check
        // reads "not yet measurable" instead of a false OK.
        expect(screen.getByTestId('dq-status-DQ-01')).toHaveTextContent('OK');
        expect(screen.getByTestId('dq-status-DQ-16')).toHaveTextContent('Finding');
        expect(screen.getByTestId('dq-status-DQ-23')).toHaveTextContent('Not yet measurable');
        expect(screen.getByTestId('dq-summary-findings')).toHaveTextContent('1');
        expect(screen.getByTestId('dq-count-DQ-16')).toHaveTextContent('1');

        // Expanding the finding reveals the violating row linked to the vendor.
        fireEvent.click(screen.getByTestId('dq-check-DQ-16'));
        await waitFor(() => {
            expect(screen.getByTestId('dq-rows-DQ-16')).toBeInTheDocument();
        });
        const link = screen.getByRole('link', { name: /BIZ DATA/ });
        expect(link).toHaveAttribute('href', '/vendors/3');

        // The findings-only filter hides the OK check.
        expect(screen.getByTestId('dq-check-DQ-01')).toBeInTheDocument();
    });

    it('auto-expands the check named by a committee drill-down deep link', async () => {
        getViolations.mockResolvedValue({
            items: [
                {
                    entity_type: 'vendor',
                    entity_id: 3,
                    label: 'BIZ DATA',
                    route_entity_type: 'vendor',
                    route_entity_id: 3,
                },
            ],
            total: 1,
            offset: 0,
            limit: 50,
        });
        getDataQuality.mockResolvedValue({
            checks: [
                sampleCheck(),
                sampleCheck({
                    check_id: 'DQ-16',
                    area: 'Dodavatelé',
                    title_cs: 'Kritický/Významný dodavatel bez ID kódu',
                    severity: 'Vysoká',
                    status: DQ_STATUS_FINDING,
                    count: 1,
                    violating_rows: [
                        {
                            entity_type: 'vendor',
                            entity_id: 3,
                            label: 'BIZ DATA',
                            route_entity_type: 'vendor',
                            route_entity_id: 3,
                        },
                    ],
                }),
            ],
            finding_count: 1,
        });

        const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
        render(
            <MemoryRouter initialEntries={['/ict-register/data-quality?check=DQ-16']}>
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        // The deep-linked check arrives already expanded — no click needed.
        await waitFor(() => {
            expect(screen.getByTestId('dq-rows-DQ-16')).toBeInTheDocument();
        });
        expect(await screen.findByRole('link', { name: /BIZ DATA/ })).toHaveAttribute(
            'href',
            '/vendors/3'
        );
    });

    it('renders a tokenized violating-row label as the localized Unknown fallback, never the token', async () => {
        getViolations.mockResolvedValue({
            items: [
                {
                    entity_type: 'contract',
                    entity_id: 5,
                    label: '{{unknown_contract}} → ?',
                    route_entity_type: 'vendor',
                    route_entity_id: 5,
                },
            ],
            total: 1,
            offset: 0,
            limit: 50,
        });
        getDataQuality.mockResolvedValue({
            checks: [
                sampleCheck({
                    check_id: 'DQ-40',
                    area: 'Vazby',
                    title_cs: 'Vazba na neexistující ID (listy 06/08/09)',
                    status: DQ_STATUS_FINDING,
                    count: 1,
                    violating_rows: [
                        {
                            entity_type: 'contract',
                            entity_id: 5,
                            label: '{{unknown_contract}} → ?',
                            route_entity_type: 'vendor',
                            route_entity_id: 5,
                        },
                    ],
                }),
            ],
            finding_count: 1,
        });

        const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
        render(
            <MemoryRouter>
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        fireEvent.click(await screen.findByTestId('dq-check-DQ-40'));
        await waitFor(() => {
            expect(screen.getByTestId('dq-rows-DQ-40')).toBeInTheDocument();
        });
        const rows = screen.getByTestId('dq-rows-DQ-40');
        expect(rows).toHaveTextContent('Unknown contract → ?');
        expect(rows).not.toHaveTextContent('{{unknown_contract}}');
    });

    it('shows a positive all-clear when the register has checks but zero findings (S10)', async () => {
        getDataQuality.mockResolvedValue({
            checks: [sampleCheck(), sampleCheck({ check_id: 'DQ-02', title_cs: 'GAP: RTO > MTPD' })],
            finding_count: 0,
        });

        const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
        render(
            <MemoryRouter>
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        const allClear = await screen.findByTestId('dq-all-clear');
        expect(allClear).toHaveTextContent('All clear');
        // The count feeds the copy; findings summary reads a genuine 0.
        expect(allClear).toHaveTextContent('2');
        expect(screen.getByTestId('dq-summary-findings')).toHaveTextContent('0');
    });

    it('hides the all-clear as soon as a finding exists', async () => {
        getDataQuality.mockResolvedValue({
            checks: [
                sampleCheck(),
                sampleCheck({
                    check_id: 'DQ-16',
                    status: DQ_STATUS_FINDING,
                    count: 1,
                    violating_rows: [
                        {
                            entity_type: 'vendor',
                            entity_id: 3,
                            label: 'BIZ DATA',
                            route_entity_type: 'vendor',
                            route_entity_id: 3,
                        },
                    ],
                }),
            ],
            finding_count: 1,
        });

        const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
        render(
            <MemoryRouter>
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        await screen.findByText('Process without an owner');
        expect(screen.queryByTestId('dq-all-clear')).not.toBeInTheDocument();
    });

    it('notes "N of M shown" when the global count exceeds the RBAC-scoped rows (S12)', async () => {
        getDataQuality.mockResolvedValue({
            checks: [
                sampleCheck({
                    check_id: 'DQ-16',
                    area: 'Dodavatelé',
                    title_cs: 'Kritický/Významný dodavatel bez ID kódu',
                    status: DQ_STATUS_FINDING,
                    // Global count 5, but the API returned only the 2 rows this
                    // user may see → the page must say "2 of 5", not read as a miss.
                    count: 5,
                    violating_rows: [
                        {
                            entity_type: 'vendor',
                            entity_id: 3,
                            label: 'BIZ DATA',
                            route_entity_type: 'vendor',
                            route_entity_id: 3,
                        },
                        {
                            entity_type: 'vendor',
                            entity_id: 4,
                            label: 'Cloud s.r.o.',
                            route_entity_type: 'vendor',
                            route_entity_id: 4,
                        },
                    ],
                }),
            ],
            finding_count: 1,
        });

        const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
        render(
            <MemoryRouter>
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        fireEvent.click(await screen.findByTestId('dq-check-DQ-16'));
        const scoped = await screen.findByTestId('dq-rows-scoped-DQ-16');
        expect(scoped).toHaveTextContent('2');
        expect(scoped).toHaveTextContent('5');
    });

    it('omits the scoped note when every violating row is shown', async () => {
        getDataQuality.mockResolvedValue({
            checks: [
                sampleCheck({
                    check_id: 'DQ-16',
                    status: DQ_STATUS_FINDING,
                    count: 1,
                    violating_rows: [
                        {
                            entity_type: 'vendor',
                            entity_id: 3,
                            label: 'BIZ DATA',
                            route_entity_type: 'vendor',
                            route_entity_id: 3,
                        },
                    ],
                }),
            ],
            finding_count: 1,
        });

        const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
        render(
            <MemoryRouter>
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        fireEvent.click(await screen.findByTestId('dq-check-DQ-16'));
        await waitFor(() => {
            expect(screen.getByTestId('dq-rows-DQ-16')).toBeInTheDocument();
        });
        expect(screen.queryByTestId('dq-rows-scoped-DQ-16')).not.toBeInTheDocument();
    });
});
