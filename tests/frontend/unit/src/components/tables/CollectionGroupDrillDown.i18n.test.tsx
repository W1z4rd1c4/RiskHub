import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    it('keeps drill-down cards as native, activatable buttons', async () => {
        await i18n.changeLanguage('en');
        const user = userEvent.setup();
        const onSelectGroup = vi.fn();
        render(
            <CollectionGroupDrillDown
                currentPage={1}
                groups={[{ value: 'owner:1', label: 'Owner', count: 3 }]}
                items={[]}
                itemsPerPage={20}
                onBack={vi.fn()}
                onPageChange={vi.fn()}
                onSelectGroup={onSelectGroup}
                renderTable={() => null}
                selectedGroupLabel={null}
                selectedGroupValue={null}
                totalCount={3}
                totalPages={1}
            />,
        );
        const collectionCard = screen.getByRole('button', { name: /Owner/ });
        expect(collectionCard).toHaveAttribute('type', 'button');
        await user.click(collectionCard);
        expect(onSelectGroup).toHaveBeenCalledWith('owner:1', 'Owner');
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

    it.each([
        ['en', 'Back to groups', 3, '3 items', 1, '1 item'],
        ['cs', 'Zpět na skupiny', 3, '3 položky', 5, '5 položek'],
    ] as const)('names the %s back action by its destination and pluralises the item count', async (
        language,
        backLabel,
        count,
        countLabel,
        otherCount,
        otherCountLabel,
    ) => {
        await i18n.changeLanguage(language);
        const user = userEvent.setup();
        const onBack = vi.fn();
        const renderSelected = (totalCount: number) => (
            <CollectionGroupDrillDown
                currentPage={1}
                groups={[{ value: 'owner:1', label: 'Owner', count: totalCount }]}
                items={[]}
                itemsPerPage={20}
                onBack={onBack}
                onPageChange={vi.fn()}
                onSelectGroup={vi.fn()}
                renderTable={() => null}
                selectedGroupLabel="Owner"
                selectedGroupValue="owner:1"
                totalCount={totalCount}
                totalPages={1}
            />
        );
        const { rerender } = render(renderSelected(count));
        expect(screen.getByText(countLabel)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: backLabel }));
        expect(onBack).toHaveBeenCalledTimes(1);

        rerender(renderSelected(otherCount));
        expect(screen.getByText(otherCountLabel)).toBeInTheDocument();
    });
});
