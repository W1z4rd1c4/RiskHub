import { render, screen } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { CollectionGroupDrillDown } from '@/components/tables/CollectionGroupDrillDown';
import i18n from '@/i18n';

const localizedGroupLabel = (group: { value: string; label: string }) => {
    if (group.value === 'criticality:critical') {
        return i18n.t('processes:values.preliminary_criticality.critical');
    }
    if (group.value === '__unassigned__') {
        return i18n.t('processes:register.groups.unassigned');
    }
    return group.label;
};

function renderGroups(selectedGroupValue: string | null = null, selectedGroupLabel: string | null = null) {
    return render(
        <CollectionGroupDrillDown
            currentPage={1}
            groups={[{
                value: 'owner:1',
                label: 'Owner',
                count: 3,
                active_count: 2,
            }]}
            items={[]}
            itemsPerPage={20}
            onBack={vi.fn()}
            onPageChange={vi.fn()}
            onSelectGroup={vi.fn()}
            renderTable={() => null}
            selectedGroupLabel={selectedGroupLabel}
            selectedGroupValue={selectedGroupValue}
            totalCount={3}
            totalPages={1}
        />,
    );
}

function renderLocalizedGroups(selectedGroupValue: string | null = null, selectedGroupLabel: string | null = null) {
    return render(
        <CollectionGroupDrillDown
            currentPage={1}
            groups={[
                { value: 'criticality:critical', label: 'critical', count: 2 },
                { value: '__unassigned__', label: 'Unassigned', count: 1 },
            ]}
            groupLabel={localizedGroupLabel}
            items={[]}
            itemsPerPage={20}
            onBack={vi.fn()}
            onPageChange={vi.fn()}
            onSelectGroup={vi.fn()}
            renderTable={() => null}
            selectedGroupLabel={selectedGroupLabel}
            selectedGroupValue={selectedGroupValue}
            totalCount={3}
            totalPages={1}
        />,
    );
}

describe('CollectionGroupDrillDown localization', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('renders group counters in English', async () => {
        await i18n.changeLanguage('en');
        renderGroups();
        expect(screen.getByText('Items')).toBeInTheDocument();
        expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders group counters in Czech', async () => {
        await i18n.changeLanguage('cs');
        renderGroups();
        expect(screen.getByText('Položky')).toBeInTheDocument();
        expect(screen.getByText('Aktivní')).toBeInTheDocument();
    });

    it.each([
        ['en', 'Critical', 'Unassigned'],
        ['cs', 'Kritická', 'Nepřiřazeno'],
    ] as const)('uses transformed %s labels in both summary cards and selected headings', async (
        language,
        criticalityLabel,
        specialLabel,
    ) => {
        await i18n.changeLanguage(language);
        const { rerender } = renderLocalizedGroups();
        expect(screen.getByRole('button', { name: new RegExp(criticalityLabel) })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: new RegExp(specialLabel) })).toBeInTheDocument();

        rerender(
            <CollectionGroupDrillDown
                currentPage={1}
                groups={[
                    { value: 'criticality:critical', label: 'critical', count: 2 },
                    { value: '__unassigned__', label: 'Unassigned', count: 1 },
                ]}
                groupLabel={localizedGroupLabel}
                items={[]}
                itemsPerPage={20}
                onBack={vi.fn()}
                onPageChange={vi.fn()}
                onSelectGroup={vi.fn()}
                renderTable={() => null}
                selectedGroupLabel="critical"
                selectedGroupValue="criticality:critical"
                totalCount={2}
                totalPages={1}
            />,
        );
        expect(screen.getByRole('heading', { name: criticalityLabel })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'critical' })).not.toBeInTheDocument();

        rerender(
            <CollectionGroupDrillDown
                currentPage={1}
                groups={[
                    { value: 'criticality:critical', label: 'critical', count: 2 },
                    { value: '__unassigned__', label: 'Unassigned', count: 1 },
                ]}
                groupLabel={localizedGroupLabel}
                items={[]}
                itemsPerPage={20}
                onBack={vi.fn()}
                onPageChange={vi.fn()}
                onSelectGroup={vi.fn()}
                renderTable={() => null}
                selectedGroupLabel="Unassigned"
                selectedGroupValue="__unassigned__"
                totalCount={1}
                totalPages={1}
            />,
        );
        expect(screen.getByRole('heading', { name: specialLabel })).toBeInTheDocument();
    });
});
