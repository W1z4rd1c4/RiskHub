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
            violatingRowCount: 2,
        });
    });
});

describe('IctRegisterDqPage', () => {
    it('lists checks with status pills and drills down to violating-row links', async () => {
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
            <MemoryRouter>
                <IctRegisterDqPage />
            </MemoryRouter>
        );

        // The EN gloss titles come from the bilingual ictRegisterDq namespace.
        expect(await screen.findByText('Process without an owner')).toBeInTheDocument();
        expect(screen.getByText('Critical/Significant vendor without an ID code')).toBeInTheDocument();

        // Status pills: one OK, one Finding; summary tiles reflect them.
        expect(screen.getByTestId('dq-status-DQ-01')).toHaveTextContent('OK');
        expect(screen.getByTestId('dq-status-DQ-16')).toHaveTextContent('Finding');
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
});
