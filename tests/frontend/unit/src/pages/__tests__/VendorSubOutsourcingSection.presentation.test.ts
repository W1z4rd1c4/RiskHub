import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getVendorDetailScrollTargetId } from '@/pages/vendors/vendorDetailPresentation';
import {
    buildSubOutsourcingChainRows,
    buildVendorSubOutsourcingColumns,
    buildVendorSubOutsourcingPayload,
    formatSubOutsourcingRank,
    getSubOutsourcingDisplayStatus,
    resolveSubOutsourcingContractLabel,
} from '@/pages/vendors/vendorSubOutsourcingPresentation';
import type {
    VendorSubOutsourcing,
    VendorSubOutsourcingDerived,
} from '@/types/vendorSubOutsourcing';

function sampleDerived(
    overrides: Partial<VendorSubOutsourcingDerived> = {},
): VendorSubOutsourcingDerived {
    return {
        contract_reference: 'SML-2020-001',
        contract_vendor_id: 4,
        contract_vendor_name: 'BIZ DATA',
        rank: 2,
        critical_service: 'Ne',
        chain_check: 'OK',
        roi_scope: 'Ano',
        inputs: {
            contract_id: 9,
            predecessor_id: null,
            predecessor_rank: null,
            is_direct: true,
            duplicate_key_count: 1,
        },
        ...overrides,
    };
}

function sampleEntry(overrides: Partial<VendorSubOutsourcing> = {}): VendorSubOutsourcing {
    return {
        id: 21,
        vendor_id: 4,
        contract_id: 9,
        predecessor_id: null,
        sub_provider_name: 'CLOUD OPS s.r.o.',
        identifier_type: 'IČO (CRN)',
        identifier_value: '87654321',
        country: 'CZ',
        ict_service_code: 'S17',
        note: null,
        is_archived: false,
        archived_at: null,
        archived_by_id: null,
        capabilities: null,
        created_at: '2026-07-10T10:00:00Z',
        updated_at: '2026-07-10T10:00:00Z',
        ...overrides,
    };
}

describe('Vendor sub-outsourcing section presentation helpers', () => {
    it('strips empty strings to nulls and drops untouched fields in write payloads', () => {
        expect(
            buildVendorSubOutsourcingPayload({
                contract_id: 9,
                predecessor_id: null,
                sub_provider_name: '  CLOUD OPS s.r.o. ',
                identifier_type: '',
                country: 'CZ',
                note: '',
            })
        ).toEqual({
            contract_id: 9,
            predecessor_id: null,
            sub_provider_name: 'CLOUD OPS s.r.o.',
            identifier_type: null,
            country: 'CZ',
            note: null,
        });
    });

    it('derives the display status from the archive flag', () => {
        expect(getSubOutsourcingDisplayStatus(sampleEntry())).toBe('active');
        expect(getSubOutsourcingDisplayStatus(sampleEntry({ is_archived: true }))).toBe('archived');
    });

    it('groups chain rows by contract and walks predecessors to full depth', () => {
        // Contract 9 carries A -> B -> C (three tiers); contract 12 carries D.
        const a = sampleEntry({ id: 1, contract_id: 9 });
        const b = sampleEntry({ id: 2, contract_id: 9, predecessor_id: 1, sub_provider_name: 'DC HOSTING GmbH' });
        const c = sampleEntry({ id: 3, contract_id: 9, predecessor_id: 2, sub_provider_name: 'Fiber Networks a.s.' });
        const d = sampleEntry({ id: 4, contract_id: 12, sub_provider_name: 'Print Services s.r.o.' });

        // Input order is irrelevant: rows come back contract-grouped, parents first.
        const rows = buildSubOutsourcingChainRows([c, d, a, b]);
        expect(rows.map((row) => row.entry.id)).toEqual([1, 2, 3, 4]);
        expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 0]);
        expect(rows.map((row) => row.entry.contract_id)).toEqual([9, 9, 9, 12]);
    });

    it('keeps archived links in the structure and roots orphaned entries defensively', () => {
        const root = sampleEntry({ id: 1, is_archived: true });
        const child = sampleEntry({ id: 2, predecessor_id: 1 });
        // An entry whose predecessor is not in the set still renders, as a root.
        const orphan = sampleEntry({ id: 3, predecessor_id: 999 });

        const rows = buildSubOutsourcingChainRows([orphan, child, root]);
        expect(rows.map((row) => row.entry.id)).toEqual([1, 2, 3]);
        expect(rows.map((row) => row.depth)).toEqual([0, 1, 0]);
    });

    it('resolves contract labels from real payload labels, never a raw #id', () => {
        const labels = new Map([[9, 'SML-2020-001']]);

        // The contracts collection's label wins when the contract is known.
        expect(resolveSubOutsourcingContractLabel(sampleEntry(), labels, 'Unknown contract')).toBe(
            'SML-2020-001'
        );

        // A map miss falls back to the contract reference the entry's derived
        // block already embeds (real label while the contracts query loads).
        expect(
            resolveSubOutsourcingContractLabel(
                sampleEntry({ contract_id: 12, derived: sampleDerived() }),
                labels,
                'Unknown contract'
            )
        ).toBe('SML-2020-001');

        // With no real label anywhere the i18n'd unknown label renders —
        // the raw technical id never does.
        const unresolved = resolveSubOutsourcingContractLabel(
            sampleEntry({ contract_id: 12, derived: sampleDerived({ contract_reference: null }) }),
            labels,
            'Unknown contract'
        );
        expect(unresolved).toBe('Unknown contract');
        expect(
            resolveSubOutsourcingContractLabel(sampleEntry({ contract_id: 12 }), labels, 'Unknown contract')
        ).toBe('Unknown contract');
        expect(unresolved).not.toContain('#');
        expect(unresolved).not.toContain('12');
    });

    it('renders the sub-provider identity, country, service code, and contract in the columns', () => {
        const columns = buildVendorSubOutsourcingColumns({
            t: (key: string) => key,
            getContractLabel: (entry: VendorSubOutsourcing) => `SML-${entry.contract_id}`,
            onEdit: () => undefined,
            onArchive: () => undefined,
            onRestore: () => undefined,
        });

        const row = { entry: sampleEntry(), depth: 1 };

        const providerColumn = columns.find((column) => column.key === 'sub_provider');
        render(providerColumn?.render?.(row, 0) as ReactElement);
        expect(screen.getByText('CLOUD OPS s.r.o.')).toBeInTheDocument();
        expect(screen.getByText(/IČO \(CRN\)/)).toBeInTheDocument();
        expect(screen.getByText(/87654321/)).toBeInTheDocument();

        const contractColumn = columns.find((column) => column.key === 'contract');
        render(contractColumn?.render?.(row, 0) as ReactElement);
        expect(screen.getByText('SML-9')).toBeInTheDocument();

        const countryColumn = columns.find((column) => column.key === 'country');
        render(countryColumn?.render?.(row, 0) as ReactElement);
        expect(screen.getByText('CZ')).toBeInTheDocument();

        const serviceColumn = columns.find((column) => column.key === 'ict_service_code');
        render(serviceColumn?.render?.(row, 0) as ReactElement);
        expect(screen.getByText('S17')).toBeInTheDocument();
    });

    it('indents chain rows by their depth for the full-depth render', () => {
        const columns = buildVendorSubOutsourcingColumns({
            t: (key: string) => key,
            getContractLabel: () => '—',
            onEdit: () => undefined,
            onArchive: () => undefined,
            onRestore: () => undefined,
        });
        const providerColumn = columns.find((column) => column.key === 'sub_provider');

        render(providerColumn?.render?.({ entry: sampleEntry({ id: 31 }), depth: 2 }, 0) as ReactElement);
        const indented = screen.getByTestId('vendor-sub-outsourcing-provider-31');
        expect(indented.style.paddingLeft).toBe('40px');

        render(providerColumn?.render?.({ entry: sampleEntry({ id: 32 }), depth: 0 }, 0) as ReactElement);
        expect(screen.getByTestId('vendor-sub-outsourcing-provider-32').style.paddingLeft).toBe('0px');
    });

    it('gates per-row actions on backend capabilities', () => {
        const onRestore = vi.fn();
        const columns = buildVendorSubOutsourcingColumns({
            t: (key: string) => key,
            getContractLabel: () => '—',
            onEdit: () => undefined,
            onArchive: () => undefined,
            onRestore,
        });
        const actionsColumn = columns.find((column) => column.key === 'actions');

        // Without capabilities nothing is actionable.
        render(actionsColumn?.render?.({ entry: sampleEntry({ id: 9 }), depth: 0 }, 0) as ReactElement);
        expect(screen.queryByTestId('vendor-sub-outsourcing-edit-9')).not.toBeInTheDocument();
        expect(screen.queryByTestId('vendor-sub-outsourcing-archive-9')).not.toBeInTheDocument();
        expect(screen.queryByTestId('vendor-sub-outsourcing-restore-9')).not.toBeInTheDocument();

        // An active maintainable row exposes edit + archive.
        render(
            actionsColumn?.render?.(
                {
                    entry: sampleEntry({
                        id: 9,
                        capabilities: { can_read: true, can_update: true, can_archive: true, can_restore: false },
                    }),
                    depth: 0,
                },
                0
            ) as ReactElement
        );
        expect(screen.getByTestId('vendor-sub-outsourcing-edit-9')).toBeInTheDocument();
        expect(screen.getByTestId('vendor-sub-outsourcing-archive-9')).toBeInTheDocument();

        // An archived restorable row exposes restore only.
        render(
            actionsColumn?.render?.(
                {
                    entry: sampleEntry({
                        id: 12,
                        is_archived: true,
                        capabilities: { can_read: true, can_update: false, can_archive: false, can_restore: true },
                    }),
                    depth: 0,
                },
                0
            ) as ReactElement
        );
        expect(screen.queryByTestId('vendor-sub-outsourcing-edit-12')).not.toBeInTheDocument();
        expect(screen.getByTestId('vendor-sub-outsourcing-restore-12')).toBeInTheDocument();
        screen.getByTestId('vendor-sub-outsourcing-restore-12').click();
        expect(onRestore).toHaveBeenCalledTimes(1);
        expect(onRestore.mock.calls[0][0]).toEqual(expect.objectContaining({ id: 12 }));
    });

    it('formats the authoritative engine rank with the workbook \u201c?\u201d sentinel', () => {
        expect(formatSubOutsourcingRank(sampleEntry({ derived: sampleDerived({ rank: 2 }) }))).toBe('2');
        expect(formatSubOutsourcingRank(sampleEntry({ derived: sampleDerived({ rank: 4 }) }))).toBe('4');
        expect(
            formatSubOutsourcingRank(sampleEntry({ derived: sampleDerived({ rank: null }) })),
        ).toBe('?');
        expect(formatSubOutsourcingRank(sampleEntry({ derived: null }))).toBe('?');
    });

    it('renders the derived Rank badge and surfaces a broken chain (#49)', () => {
        const columns = buildVendorSubOutsourcingColumns({
            t: (key: string) => key,
            getContractLabel: () => 'SML-9',
            onEdit: () => undefined,
            onArchive: () => undefined,
            onRestore: () => undefined,
        });
        const rankColumn = columns.find((column) => column.key === 'rank');

        // A ranked row shows the engine rank, no error badge.
        render(
            rankColumn?.render?.(
                { entry: sampleEntry({ id: 61, derived: sampleDerived({ rank: 3 }) }), depth: 1 },
                0
            ) as ReactElement
        );
        expect(screen.getByTestId('vendor-sub-outsourcing-rank-61')).toHaveTextContent('3');
        expect(screen.queryByTestId('vendor-sub-outsourcing-chain-error-61')).not.toBeInTheDocument();

        // A broken chain renders the \u201c?\u201d sentinel plus the chain-error finding.
        render(
            rankColumn?.render?.(
                {
                    entry: sampleEntry({
                        id: 62,
                        predecessor_id: 999,
                        derived: sampleDerived({ rank: null, chain_check: 'CHYBA \u0158ET\u011aZCE' }),
                    }),
                    depth: 0,
                },
                0
            ) as ReactElement
        );
        expect(screen.getByTestId('vendor-sub-outsourcing-rank-62')).toHaveTextContent('?');
        expect(screen.getByTestId('vendor-sub-outsourcing-chain-error-62')).toHaveTextContent(
            'sub_outsourcing.chain_status.chain_error'
        );

        // Before the engine block arrives the badge stays a placeholder.
        render(
            rankColumn?.render?.({ entry: sampleEntry({ id: 63 }), depth: 0 }, 0) as ReactElement
        );
        expect(screen.getByTestId('vendor-sub-outsourcing-rank-63')).toHaveTextContent('\u2014');
    });

    it('marks chain rows serving a critical (CIF) contract uniformly (#49)', () => {
        const columns = buildVendorSubOutsourcingColumns({
            t: (key: string) => key,
            getContractLabel: () => 'SML-9',
            onEdit: () => undefined,
            onArchive: () => undefined,
            onRestore: () => undefined,
        });
        const contractColumn = columns.find((column) => column.key === 'contract');

        render(
            contractColumn?.render?.(
                {
                    entry: sampleEntry({
                        id: 71,
                        derived: sampleDerived({ critical_service: 'Ano', rank: 4 }),
                    }),
                    depth: 2,
                },
                0
            ) as ReactElement
        );
        expect(screen.getByTestId('vendor-sub-outsourcing-critical-71')).toBeInTheDocument();

        render(
            contractColumn?.render?.(
                {
                    entry: sampleEntry({ id: 72, derived: sampleDerived({ critical_service: 'Ne' }) }),
                    depth: 0,
                },
                0
            ) as ReactElement
        );
        expect(screen.queryByTestId('vendor-sub-outsourcing-critical-72')).not.toBeInTheDocument();
    });

    it('deep-links the sub-outsourcing section inside the vendor detail', () => {
        expect(getVendorDetailScrollTargetId('sub-outsourcing', null)).toBe('vendor-sub-outsourcing');
        // The existing link mappings stay untouched.
        expect(getVendorDetailScrollTargetId('contracts', null)).toBe('vendor-contracts');
        expect(getVendorDetailScrollTargetId('connections', 'risks')).toBe('vendor-linked-risks');
        expect(getVendorDetailScrollTargetId('nonsense', null)).toBeNull();
    });
});
