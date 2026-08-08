import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
    LinkManagementDialog: ({ isOpen, title, onLink }: {
        isOpen: boolean;
        title: string;
        onLink: (targetId: number) => Promise<void>;
    }) => (
        isOpen ? (
            <div role="dialog">
                {title}
                <button type="button" onClick={() => { void onLink(101); }}>mock-link-target</button>
            </div>
        ) : null
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
            <MemoryRouter>
                <VendorLinkedEntitiesTab
                    adapter={adapter}
                    canCreate
                    canEdit
                    protectedChangeRequiresApproval={false}
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
                />
            </MemoryRouter>,
        );

        await waitFor(() => expect(screen.queryByText('labels.loading')).not.toBeInTheDocument());
        expect(screen.getByText('tabs.linked_fake')).toBeInTheDocument();
        expect(screen.getByText('links.fake.subtitle')).toBeInTheDocument();
        expect(screen.getByText('links.fake.empty')).toBeInTheDocument();
        expect(screen.getByText('links.actions.manage_existing')).toBeInTheDocument();

        await userEvent.click(screen.getByText('links.actions.link_existing'));
        expect(screen.getByRole('dialog')).toHaveTextContent('links.dialogs.link_fake_title');
    });

    it('announces a rejected governed mutation INSIDE the open reason dialog, then on the page banner after close (#100 P2)', async () => {
        const rejectingAdapter: VendorLinkedEntitiesAdapter<FakeItem> = {
            ...adapter,
            link: vi.fn(async () => {
                throw Object.assign(new Error('reason required'), { status: 422 });
            }),
        };

        render(
            <MemoryRouter>
                <VendorLinkedEntitiesTab
                    adapter={rejectingAdapter}
                    canCreate
                    canEdit
                    protectedChangeRequiresApproval
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
                />
            </MemoryRouter>,
        );

        await waitFor(() => expect(screen.queryByText('labels.loading')).not.toBeInTheDocument());
        await userEvent.click(screen.getByText('links.actions.link_existing'));
        await userEvent.click(screen.getByText('mock-link-target'));

        // The governed reason dialog (a focus-trapping modal) is now open.
        const reasonDialog = await screen.findByRole('alertdialog');
        await userEvent.type(within(reasonDialog).getByRole('textbox'), 'Material register change');
        await userEvent.click(within(reasonDialog).getByRole('button', { name: 'vendors:link_approval.continue' }));

        // 422 → the error is announced INSIDE the still-open dialog.
        const dialogAlert = await within(reasonDialog).findByRole('alert');
        expect(dialogAlert).toHaveTextContent('register_links.errors.mutation_failed');
        expect(rejectingAdapter.link).toHaveBeenCalledWith(7, 101, 'Material register change');

        // The page banner is reserved for after-close visibility.
        await userEvent.click(within(reasonDialog).getByRole('button', { name: 'actions.cancel' }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        expect(screen.getByRole('alert')).toHaveTextContent('register_links.errors.mutation_failed');
    });
});
