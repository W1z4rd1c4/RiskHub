import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrphanedItemsTable } from '@/components/governance/OrphanedItemsTable';
import type { OrphanedItem } from '@/types/orphanedItem';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/i18n/formatters', () => ({
    formatRelativeDateValue: () => 'recently',
}));

const baseItem: OrphanedItem = {
    id: 1,
    item_type: 'risk',
    item_id: 101,
    item_name: 'Customer Data Risk',
    item_description: 'Needs owner',
    item_identifier: 'R-101',
    department_name: 'Operations',
    previous_owner_name: 'Former Owner',
    previous_owner_email: 'former@example.com',
    orphaned_at: '2026-03-07T10:00:00Z',
    status: 'pending',
};

describe('OrphanedItemsTable capabilities', () => {
    it('hides resolve action when backend capabilities deny it', () => {
        const onResolve = vi.fn();
        render(
            <OrphanedItemsTable
                items={[{ ...baseItem, capabilities: { can_resolve: false, can_view_detail: true, requires_owner: true, requires_risk: false, requires_department: true } }]}
                onResolve={onResolve}
            />,
        );

        expect(screen.queryByRole('button', { name: 'governance.resolve' })).not.toBeInTheDocument();
    });

    it('calls resolve when backend capabilities allow it', () => {
        const onResolve = vi.fn();
        render(
            <OrphanedItemsTable
                items={[{ ...baseItem, capabilities: { can_resolve: true, can_view_detail: true, requires_owner: true, requires_risk: false, requires_department: true } }]}
                onResolve={onResolve}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'governance.resolve' }));

        expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ id: baseItem.id }));
    });
});
