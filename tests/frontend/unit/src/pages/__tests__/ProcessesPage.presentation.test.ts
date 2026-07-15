import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { buildProcessColumns } from '@/pages/processes/processColumns';
import { processSchema } from '@/services/api/schemas/entities/processes';
import {
    buildProcessListParams,
    buildProcessWritePayload,
    getProcessDisplayStatus,
    processControlledValueLabel,
    processDepartmentDisplayLabel,
    processDerivedCifLabel,
    processDerivedCheckLabel,
    processDerivedCriticalityLabel,
    processOwnerDisplayLabel,
    processesEmptyStateKey,
} from '@/pages/processes/processesPagePresentation';
import type { Process, ProcessDerived } from '@/types/process';
import i18n from '@/i18n';

afterEach(async () => {
    await i18n.changeLanguage('en');
});

function sampleProcessDerived(overrides: Partial<ProcessDerived> = {}): ProcessDerived {
    return {
        criticality_score: 17,
        criticality_class: 'critical',
        cif: 'yes',
        rto_mtpd_check: 'ok',
        bcm_check: 'ok',
        next_review_date: null,
        linked_asset_count: 1,
        linked_vendor_count: 0,
        is_complete: false,
        is_duplicate: false,
        inputs: {
            impact_client: 4,
            impact_market_operations: 4,
            impact_regulatory: 4,
            impact_financial: 5,
            mtpd_hours: 24,
            mtpd_bonus: 3,
            threshold_critical_score: 16,
            threshold_high_score: 12,
            threshold_medium_score: 8,
            mtpd_critical_hours: 4,
            mtpd_medium_hours: 24,
            preliminary_criticality: 'high',
            criticality_class_source: 'score',
            cif_override: null,
            cif_class_critical: true,
            cif_mtpd_within_critical: false,
            cif_any_impact_maximal: true,
            rto_hours: 8,
            bcm_link: 'yes',
            assessment_date: null,
            missing_for_completeness: ['owner'],
            manual_vendor_link_count: 0,
            transitive_vendor_pair_count: 0,
        },
        transitive_vendor_links: [],
        ...overrides,
    };
}

function sampleProcess(overrides: Partial<Process> = {}): Process {
    return {
        id: 7,
        f_code: 'F7',
        l0_area: 'Provoz a služby klientům',
        l1_process: 'Správa pojistných smluv',
        l2_subprocess: null,
        process_owner_user_id: 4,
        process_owner: {
            name: 'Provozní ředitelka',
            email: 'owner@example.test',
            role_name: 'user',
            department_name: 'Provoz',
        },
        owning_department_id: 2,
        owning_department: { name: 'Provoz', code: 'OPS' },
        owner_orphaned: false,
        ownership_status: 'assigned',
        impact_client: 4,
        impact_market_operations: 3,
        impact_regulatory: 2,
        impact_financial: 5,
        impact_reputational: 1,
        mtpd_hours: 24,
        preliminary_criticality: 'high',
        cif_override: null,
        licensed_activity: null,
        rto_hours: 8,
        rpo_hours: 4,
        bcm_link: 'yes',
        last_dr_test_date: null,
        dr_test_result: null,
        interruption_impact: null,
        assessment_date: null,
        notes: null,
        derived: sampleProcessDerived(),
        is_archived: false,
        archived_at: null,
        archived_by_id: null,
        capabilities: null,
        created_at: '2026-07-09T10:00:00Z',
        updated_at: '2026-07-09T10:00:00Z',
        ...overrides,
    };
}

describe('Processes page presentation helpers', () => {
    it('builds register list params with search, archive filter, sort, and paging', () => {
        expect(
            buildProcessListParams({
                currentPage: 3,
                debouncedSearch: '  smluv  ',
                includeArchived: true,
                limit: 20,
                sortDirection: 'desc',
                sortField: 'l1_process',
            })
        ).toEqual({
            offset: 40,
            limit: 20,
            include_archived: true,
            search: 'smluv',
            sort_by: 'l1_process',
            sort_order: 'desc',
        });

        expect(
            buildProcessListParams({
                currentPage: 1,
                debouncedSearch: '',
                includeArchived: false,
                limit: 20,
                sortDirection: null,
                sortField: null,
            })
        ).toEqual({ offset: 0, limit: 20, include_archived: false });
    });

    it('derives the display status from the archive flag', () => {
        expect(getProcessDisplayStatus(sampleProcess())).toBe('active');
        expect(getProcessDisplayStatus(sampleProcess({ is_archived: true }))).toBe('archived');
    });

    it('strips empty strings to nulls and drops untouched fields in write payloads', () => {
        expect(
            buildProcessWritePayload({
                l0_area: 'Provoz a služby klientům',
                l1_process: 'Správa pojistných smluv',
                l2_subprocess: '',
                process_owner_user_id: 4,
                owning_department_id: 2,
                impact_client: 4,
                impact_market_operations: null,
                mtpd_hours: 24,
                preliminary_criticality: '',
                cif_override: 'yes',
                notes: '',
            })
        ).toEqual({
            l0_area: 'Provoz a služby klientům',
            l1_process: 'Správa pojistných smluv',
            l2_subprocess: null,
            process_owner_user_id: 4,
            owning_department_id: 2,
            impact_client: 4,
            impact_market_operations: null,
            mtpd_hours: 24,
            preliminary_criticality: null,
            cif_override: 'yes',
            notes: null,
        });
    });

    it('renders the F-code and the archived status pill in the table columns', () => {
        const columns = buildProcessColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreProcess: () => false,
        });

        const fCodeColumn = columns.find((column) => column.key === 'f_code');
        render(fCodeColumn?.render?.(sampleProcess(), 0) as ReactElement);
        expect(screen.getByText('F7')).toBeInTheDocument();

        const statusColumn = columns.find((column) => column.key === 'status');
        render(statusColumn?.render?.(sampleProcess({ is_archived: true }), 0) as ReactElement);
        expect(screen.getByText('processes:status.archived')).toBeInTheDocument();
    });

    it('exposes MTPD and the derived criticality columns in the register column set', () => {
        const columns = buildProcessColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreProcess: () => false,
        });
        const keys = columns.map((column) => column.key);

        expect(keys).toContain('mtpd_hours');
        // Ticket #48: the register shows the ENGINE-derived class and CIF; the
        // entered preliminary class stays a form/detail field only.
        expect(keys).toContain('derived_criticality_class');
        expect(keys).toContain('derived_cif');
        expect(keys).not.toContain('preliminary_criticality');
        expect(keys).not.toContain('cif_override');

        const mtpdColumn = columns.find((column) => column.key === 'mtpd_hours');
        render(mtpdColumn?.render?.(sampleProcess(), 0) as ReactElement);
        expect(screen.getByText('24')).toBeInTheDocument();

        // P8 (FR-P5-4): the numeric MTPD column is right-aligned on both the
        // header and the cell, and stays tabular so digits line up.
        expect(mtpdColumn?.className).toContain('text-right');
        expect(mtpdColumn?.headerClassName).toContain('text-right');
        expect(screen.getByText('24').className).toContain('tabular-nums');
    });

    it('distinguishes an empty register from an unmatched search (FR-P5-5)', () => {
        expect(processesEmptyStateKey(false)).toBe('empty.no_processes');
        expect(processesEmptyStateKey(true)).toBe('empty.no_results');
    });

    it('renders the derived criticality class pill and CIF read-only', () => {
        // Parse the complete HTTP response shape before presenting it: this is
        // the API -> frontend schema -> localized column contract.
        const apiProcess = processSchema.parse(sampleProcess());
        const columns = buildProcessColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreProcess: () => false,
        });

        const classColumn = columns.find((column) => column.key === 'derived_criticality_class');
        render(classColumn?.render?.(apiProcess, 0) as ReactElement);
        expect(screen.getByText('processes:values.preliminary_criticality.critical')).toBeInTheDocument();

        const cifColumn = columns.find((column) => column.key === 'derived_cif');
        render(cifColumn?.render?.(apiProcess, 0) as ReactElement);
        expect(screen.getByText('processes:values.cif_override.yes')).toBeInTheDocument();
    });

    it('renders placeholders when the derived block is absent', () => {
        const columns = buildProcessColumns({
            t: (key: string) => key,
            onRestore: () => undefined,
            canRestoreProcess: () => false,
        });
        const bare = sampleProcess({ derived: null });

        const classColumn = columns.find((column) => column.key === 'derived_criticality_class');
        render(classColumn?.render?.(bare, 0) as ReactElement);
        const cifColumn = columns.find((column) => column.key === 'derived_cif');
        render(cifColumn?.render?.(bare, 0) as ReactElement);
        expect(screen.getAllByText('—')).toHaveLength(2);
    });

    it('rejects runtime workbook labels and renders invalid values as localized Unknown', () => {
        const t = (key: string) => key;

        expect(processDerivedCriticalityLabel(t, 'Kritická')).toBe('processes:values.unknown');
        expect(processDerivedCifLabel(t, 'Ano')).toBe('processes:values.unknown');
        expect(processControlledValueLabel(t, 'bcm_link', 'Neposouzeno')).toBe('processes:values.unknown');
        expect(() => processSchema.parse(sampleProcess({
            derived: sampleProcessDerived({ criticality_class: 'Kritická' as never }),
        }))).toThrow();
    });

    it('localizes canonical derived check codes without accepting workbook literals', () => {
        const t = (key: string) => key;

        expect(processDerivedCheckLabel(t, 'ok')).toBe('processes:derived.checks.ok');
        expect(processDerivedCheckLabel(t, 'rto_exceeds_mtpd')).toBe(
            'processes:derived.checks.rto_exceeds_mtpd',
        );
        expect(processDerivedCheckLabel(t, 'cif_without_bcm')).toBe(
            'processes:derived.checks.cif_without_bcm',
        );
    });

    it.each([
        ['en', 'Unknown user', 'Unknown department'],
        ['cs', 'Neznámý uživatel', 'Neznámý útvar'],
    ] as const)('renders safe localized list fallbacks in %s', async (language, owner, department) => {
        await i18n.changeLanguage(language);
        const missing = sampleProcess({
            process_owner: null,
            owning_department: null,
            ownership_status: 'assigned',
        });
        const translate = (key: string) => String(i18n.t(key));

        expect(processOwnerDisplayLabel(translate, missing)).toBe(owner);
        expect(processDepartmentDisplayLabel(translate, missing)).toBe(department);

        const columns = buildProcessColumns({
            t: translate,
            onRestore: () => undefined,
            canRestoreProcess: () => false,
        });
        const ownerColumn = columns.find((column) => column.key === 'owner');
        render(ownerColumn?.render?.(missing, 0) as ReactElement);
        expect(screen.getByText(owner)).toBeInTheDocument();
        expect(screen.getByText(department)).toBeInTheDocument();
        expect(screen.queryByText(String(missing.process_owner_user_id))).not.toBeInTheDocument();
        expect(screen.queryByText(String(missing.owning_department_id))).not.toBeInTheDocument();
    });
});
