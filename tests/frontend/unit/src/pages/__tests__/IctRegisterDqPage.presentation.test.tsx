import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
    DQ_STATUS_FINDING,
    DQ_STATUS_OK,
    dqAreaKey,
    dqSeverityKey,
    filterChecks,
    isFinding,
    isProductionInert,
    parseDqPageQueryParams,
    summarizeChecks,
    violatingRowPath,
} from '@/pages/ictRegisterDq/dqPresentation';
import type { IctDqCheck } from '@/types/ictRegisterDq';

const getDataQuality = vi.fn();

vi.mock('@/services/ictRegisterDqApi', () => ({
    ictRegisterDqApi: {
        getDataQuality: (...args: unknown[]) => getDataQuality(...args),
    },
}));

function sampleCheck(overrides: Partial<IctDqCheck> = {}): IctDqCheck {
    return {
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
        });
        expect(parseDqPageQueryParams(new URLSearchParams('status=findings'))).toEqual({
            statusFilter: 'findings',
            expandedCheckId: null,
        });
        expect(parseDqPageQueryParams(new URLSearchParams('status=bogus&check='))).toEqual({
            statusFilter: 'all',
            expandedCheckId: null,
        });
    });
});

describe('IctRegisterDqPage', () => {
    it('lists checks with status pills and drills down to violating-row links', async () => {
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
        expect(screen.getByRole('link', { name: /BIZ DATA/ })).toHaveAttribute('href', '/vendors/3');
    });
});
