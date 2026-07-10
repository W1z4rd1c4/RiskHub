import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getVendorDetailScrollTargetId } from '@/pages/vendors/vendorDetailPresentation';
import {
    buildVendorContractColumns,
    buildVendorContractPayload,
    getContractDisplayStatus,
    isContractReferenceDuplicate,
} from '@/pages/vendors/vendorContractsPresentation';
import type { VendorContract, VendorContractDerived } from '@/types/vendorContract';

function sampleContractDerived(
    overrides: Partial<VendorContractDerived> = {},
): VendorContractDerived {
    return {
        vendor_name: 'BIZ DATA',
        sub_outsourcing_chain: 'BIZ DATA → CLOUD OPS s.r.o. → DC HOSTING GmbH',
        duplicate_check: 'OK',
        cif: 'Ano',
        inputs: {
            vendor_id: 4,
            prime_vendor_cif: 'Ano',
            reference_duplicate_count: 1,
            sub_outsourcing_count: 2,
        },
        ...overrides,
    };
}

function sampleContract(overrides: Partial<VendorContract> = {}): VendorContract {
    return {
        id: 9,
        vendor_id: 4,
        contract_reference: 'SML-2020-001',
        internal_contract_number: 'TAS-44821',
        records_system: 'TAS',
        arrangement_type: 'Rámcové (master)',
        main_contract: 'Ano',
        overarching_arrangement_reference: null,
        description: null,
        roi_scope: 'Ano',
        start_date: '2020-01-01',
        end_date: '9999-12-31',
        notice_period_entity_days: 180,
        notice_period_provider_days: 180,
        governing_law_country: 'CZ',
        annual_cost: 4500000,
        currency: 'CZK',
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

describe('Vendor contracts section presentation helpers', () => {
    it('strips empty strings to nulls and drops untouched fields in write payloads', () => {
        expect(
            buildVendorContractPayload({
                contract_reference: '  SML-2020-001 ',
                internal_contract_number: '',
                arrangement_type: 'Rámcové (master)',
                notice_period_entity_days: 180,
                annual_cost: null,
                note: '',
            })
        ).toEqual({
            contract_reference: 'SML-2020-001',
            internal_contract_number: null,
            arrangement_type: 'Rámcové (master)',
            notice_period_entity_days: 180,
            annual_cost: null,
            note: null,
        });
    });

    it('derives the display status from the archive flag', () => {
        expect(getContractDisplayStatus(sampleContract())).toBe('active');
        expect(getContractDisplayStatus(sampleContract({ is_archived: true }))).toBe('archived');
    });

    it('renders reference, arrangement type, main-contract and RoI flags, and the cost in the columns', () => {
        const columns = buildVendorContractColumns({
            t: (key: string) => key,
            onEdit: () => undefined,
            onArchive: () => undefined,
            onRestore: () => undefined,
        });

        const referenceColumn = columns.find((column) => column.key === 'contract_reference');
        render(referenceColumn?.render?.(sampleContract(), 0) as ReactElement);
        expect(screen.getByText('SML-2020-001')).toBeInTheDocument();

        const arrangementColumn = columns.find((column) => column.key === 'arrangement_type');
        render(arrangementColumn?.render?.(sampleContract(), 0) as ReactElement);
        expect(screen.getByText('Rámcové (master)')).toBeInTheDocument();

        const flagsColumn = columns.find((column) => column.key === 'flags');
        render(flagsColumn?.render?.(sampleContract(), 0) as ReactElement);
        expect(screen.getByText('contracts.columns.main_flag')).toBeInTheDocument();
        expect(screen.getByText('contracts.columns.roi_flag')).toBeInTheDocument();

        const costColumn = columns.find((column) => column.key === 'annual_cost');
        render(costColumn?.render?.(sampleContract(), 0) as ReactElement);
        expect(screen.getByText(/CZK/)).toBeInTheDocument();

        const termColumn = columns.find((column) => column.key === 'term');
        render(termColumn?.render?.(sampleContract(), 0) as ReactElement);
        expect(screen.getByText(/2020-01-01/)).toBeInTheDocument();
    });

    it('gates per-row actions on backend capabilities', () => {
        const onRestore = vi.fn();
        const columns = buildVendorContractColumns({
            t: (key: string) => key,
            onEdit: () => undefined,
            onArchive: () => undefined,
            onRestore,
        });
        const actionsColumn = columns.find((column) => column.key === 'actions');

        // Without capabilities nothing is actionable.
        render(actionsColumn?.render?.(sampleContract(), 0) as ReactElement);
        expect(screen.queryByTestId('vendor-contract-edit-9')).not.toBeInTheDocument();
        expect(screen.queryByTestId('vendor-contract-archive-9')).not.toBeInTheDocument();
        expect(screen.queryByTestId('vendor-contract-restore-9')).not.toBeInTheDocument();

        // An active maintainable row exposes edit + archive.
        render(
            actionsColumn?.render?.(
                sampleContract({
                    capabilities: { can_read: true, can_update: true, can_archive: true, can_restore: false },
                }),
                0
            ) as ReactElement
        );
        expect(screen.getByTestId('vendor-contract-edit-9')).toBeInTheDocument();
        expect(screen.getByTestId('vendor-contract-archive-9')).toBeInTheDocument();

        // An archived restorable row exposes restore only.
        render(
            actionsColumn?.render?.(
                sampleContract({
                    id: 12,
                    is_archived: true,
                    capabilities: { can_read: true, can_update: false, can_archive: false, can_restore: true },
                }),
                0
            ) as ReactElement
        );
        expect(screen.queryByTestId('vendor-contract-edit-12')).not.toBeInTheDocument();
        expect(screen.getByTestId('vendor-contract-restore-12')).toBeInTheDocument();
        screen.getByTestId('vendor-contract-restore-12').click();
        expect(onRestore).toHaveBeenCalledTimes(1);
        expect(onRestore.mock.calls[0][0]).toEqual(expect.objectContaining({ id: 12 }));
    });

    it('flags a register-wide duplicate reference from the engine block (#49)', () => {
        expect(isContractReferenceDuplicate(sampleContract({ derived: null }))).toBe(false);
        expect(
            isContractReferenceDuplicate(sampleContract({ derived: sampleContractDerived() })),
        ).toBe(false);
        expect(
            isContractReferenceDuplicate(
                sampleContract({
                    derived: sampleContractDerived({ duplicate_check: 'DUPLICITA' }),
                }),
            ),
        ).toBe(true);

        const columns = buildVendorContractColumns({
            t: (key: string) => key,
            onEdit: () => undefined,
            onArchive: () => undefined,
            onRestore: () => undefined,
        });
        const referenceColumn = columns.find((column) => column.key === 'contract_reference');
        render(
            referenceColumn?.render?.(
                sampleContract({
                    id: 31,
                    derived: sampleContractDerived({
                        duplicate_check: 'DUPLICITA',
                        inputs: {
                            vendor_id: 4,
                            prime_vendor_cif: 'Ano',
                            reference_duplicate_count: 2,
                            sub_outsourcing_count: 0,
                        },
                    }),
                }),
                0
            ) as ReactElement
        );
        expect(screen.getByTestId('vendor-contract-duplicate-31')).toHaveTextContent(
            'contracts.columns.duplicate_flag'
        );
    });

    it('renders the derived CIF flag and the full-depth chain display (#49)', () => {
        const columns = buildVendorContractColumns({
            t: (key: string) => key,
            onEdit: () => undefined,
            onArchive: () => undefined,
            onRestore: () => undefined,
        });

        const flagsColumn = columns.find((column) => column.key === 'flags');
        render(
            flagsColumn?.render?.(
                sampleContract({ id: 41, derived: sampleContractDerived({ cif: 'Ano' }) }),
                0
            ) as ReactElement
        );
        expect(screen.getByTestId('vendor-contract-cif-41')).toHaveTextContent(
            'contracts.columns.cif'
        );

        // The chain column shows the derived vendor-name-led display string —
        // full depth (the workbook's 2-tier string cap was display-only).
        const chainColumn = columns.find((column) => column.key === 'chain');
        render(
            chainColumn?.render?.(
                sampleContract({ id: 42, derived: sampleContractDerived() }),
                0
            ) as ReactElement
        );
        expect(screen.getByTestId('vendor-contract-chain-42')).toHaveTextContent(
            'BIZ DATA → CLOUD OPS s.r.o. → DC HOSTING GmbH'
        );

        // A row without its engine block renders placeholders, never crashes.
        render(
            flagsColumn?.render?.(
                sampleContract({ id: 43, main_contract: 'Ne', roi_scope: 'Ne', derived: null }),
                0
            ) as ReactElement
        );
        expect(screen.queryByTestId('vendor-contract-cif-43')).not.toBeInTheDocument();
    });

    it('deep-links the contracts section inside the vendor detail', () => {
        expect(getVendorDetailScrollTargetId('contracts', null)).toBe('vendor-contracts');
        // The existing link mappings stay untouched.
        expect(getVendorDetailScrollTargetId('connections', 'risks')).toBe('vendor-linked-risks');
        expect(getVendorDetailScrollTargetId('nonsense', null)).toBeNull();
    });
});
