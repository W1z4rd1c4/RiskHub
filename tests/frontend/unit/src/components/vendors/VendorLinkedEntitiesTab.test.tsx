import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { VendorLinkedEntitiesAdapter } from '@/components/vendors/useVendorLinkedEntities';
import { VendorLinkedEntitiesTab } from '@/components/vendors/VendorLinkedEntitiesTab';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) => (
            options?.count === undefined ? key : `${key}:${options.count}`
        ),
    }),
}));

vi.mock('@/components/LinkManagementDialog', () => ({
    LinkManagementDialog: ({ isOpen, title }: { isOpen: boolean; title: string }) => (
        isOpen ? <div role="dialog">{title}</div> : null
    ),
}));

interface FakeItem {
    id: number;
    name: string;
    is_archived: boolean;
}

const adapter: VendorLinkedEntitiesAdapter<FakeItem> = {
    errorLogPrefix: 'test:',
    fetch: vi.fn(async () => []),
    isArchived: (item) => item.is_archived,
    link: vi.fn(async () => undefined),
    toExistingLink: (item) => ({ display_name: item.name, id: item.id, effectiveness: 'linked' }),
    unlink: vi.fn(async () => undefined),
};

describe('VendorLinkedEntitiesTab', () => {
    it('renders header, empty state, manage button, and opens the link dialog', async () => {
        render(
            <VendorLinkedEntitiesTab
                adapter={adapter}
                canCreate
                canEdit
                headerColorClass="text-indigo-400"
                i18nKeys={{
                    addAction: 'links.actions.add_fake',
                    archived: 'links.archived_fake',
                    dialogTitle: 'links.dialogs.link_fake_title',
                    empty: 'links.fake.empty',
                    subtitle: 'links.fake.subtitle',
                    tabTitle: 'tabs.linked_fake',
                }}
                icon={<span aria-hidden="true" />}
                linkDialogMode="control-to-risk"
                onAdd={vi.fn()}
                onNavigate={vi.fn()}
                renderCard={(item, onClick) => (
                    <button key={item.id} type="button" onClick={onClick}>
                        {item.name}
                    </button>
                )}
                vendorId={7}
            />,
        );

        await waitFor(() => expect(screen.queryByText('labels.loading')).not.toBeInTheDocument());
        expect(screen.getByText('tabs.linked_fake')).toBeInTheDocument();
        expect(screen.getByText('links.fake.subtitle')).toBeInTheDocument();
        expect(screen.getByText('links.fake.empty')).toBeInTheDocument();
        expect(screen.getByText('links.actions.manage_existing')).toBeInTheDocument();

        await userEvent.click(screen.getByText('links.actions.link_existing'));
        expect(screen.getByRole('dialog')).toHaveTextContent('links.dialogs.link_fake_title');
    });
});
