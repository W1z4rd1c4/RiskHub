import { describe, expect, it } from 'vitest';
import { orphanedItemsOverviewSchema } from '@/services/api/schemas';

type OverviewItem = Record<string, unknown>;

function overviewPayload(items: OverviewItem[]) {
    return {
        stats: {
            risk_count: items.filter((i) => i.item_type === 'risk').length,
            control_count: items.filter((i) => i.item_type === 'control').length,
            kri_count: items.filter((i) => i.item_type === 'kri').length,
            threat_count: items.filter((i) => i.item_type === 'threat').length,
            process_count: items.filter((i) => i.item_type === 'process').length,
            asset_count: items.filter((i) => i.item_type === 'asset').length,
            vendor_count: items.filter((i) => i.item_type === 'vendor').length,
            total_count: items.length,
        },
        items,
        last_scan_at: null,
        scan_status: null,
    };
}

function orphanItem(overrides: OverviewItem): OverviewItem {
    return {
        id: 1,
        item_type: 'risk',
        item_id: 10,
        item_name: 'Some orphan',
        item_description: null,
        item_identifier: 'R-001',
        department_name: 'Risk Management',
        previous_owner_name: 'System Admin',
        previous_owner_email: 'admin@riskhub.local',
        orphaned_at: '2026-03-24T08:52:00+00:00',
        status: 'pending',
        request_reason_required: false,
        capabilities: {
            can_resolve: true,
            can_view_detail: true,
            requires_owner: true,
            requires_risk: false,
            requires_department: true,
        },
        ...overrides,
    };
}

describe('orphanedItemsOverviewSchema', () => {
    it('accepts a control orphan whose item_identifier is null (controls have no human code)', () => {
        const payload = overviewPayload([
            orphanItem({ item_type: 'control', item_id: 62, item_name: 'Backup control', item_identifier: null }),
        ]);

        const result = orphanedItemsOverviewSchema.safeParse(payload);

        expect(result.success).toBe(true);
    });

    it('accepts the backend contract: risks carry an identifier, controls and KRIs do not', () => {
        const payload = overviewPayload([
            orphanItem({ item_type: 'risk', item_id: 10, item_identifier: 'SH-R-0014' }),
            orphanItem({ item_type: 'control', item_id: 62, item_identifier: null }),
            orphanItem({ item_type: 'kri', item_id: 7, item_identifier: null }),
        ]);

        const result = orphanedItemsOverviewSchema.safeParse(payload);

        expect(result.success).toBe(true);
    });

    it('still rejects a structurally invalid item (guard against over-loosening)', () => {
        const payload = overviewPayload([orphanItem({ item_type: 'risk', id: 'not-a-number' })]);

        const result = orphanedItemsOverviewSchema.safeParse(payload);

        expect(result.success).toBe(false);
    });

    it('decodes Process and Threat orphans returned by the backend overview', () => {
        const payload = overviewPayload([
            orphanItem({
                item_type: 'process',
                item_id: 74,
                item_name: 'Claims handling',
                item_identifier: 'F74',
                request_reason_required: true,
            }),
            orphanItem({
                item_type: 'threat',
                item_id: 73,
                item_name: 'Ransomware',
                item_identifier: null,
                request_reason_required: false,
            }),
        ]);

        const result = orphanedItemsOverviewSchema.safeParse(payload);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.stats.process_count).toBe(1);
            expect(result.data.items.map((item) => item.item_type)).toEqual(['process', 'threat']);
            expect(result.data.items.map((item) => item.request_reason_required)).toEqual([true, false]);
        }
    });

    it('rejects an orphan row without the authoritative request-reason decision', () => {
        const item = orphanItem({ item_type: 'process' });
        delete item.request_reason_required;

        const result = orphanedItemsOverviewSchema.safeParse(overviewPayload([item]));

        expect(result.success).toBe(false);
    });
});
