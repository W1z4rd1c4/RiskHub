import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profiler, Suspense, startTransition, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { VendorLinkedEntitiesAdapter } from '@/components/vendors/useVendorLinkedEntities';
import { VendorLinkedEntitiesTab } from '@/components/vendors/VendorLinkedEntitiesTab';
import { ApiClientError } from '@/services/apiClient';

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

function fakeTab(currentAdapter: VendorLinkedEntitiesAdapter<FakeItem>, vendorId = 7) {
    return (
        <MemoryRouter>
            <VendorLinkedEntitiesTab
                adapter={currentAdapter}
                canCreate
                canEdit
                protectedChangeRequiresApproval={false}
                dataTestIdPrefix="fake"
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
                vendorId={vendorId}
            />
        </MemoryRouter>
    );
}

function renderFakeTab(currentAdapter: VendorLinkedEntitiesAdapter<FakeItem>, vendorId = 7) {
    return render(fakeTab(currentAdapter, vendorId));
}

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

    it('keeps the committed vendor request owned while a different vendor transition is suspended', async () => {
        let releaseVendorA!: (items: FakeItem[]) => void;
        let releaseVendorB!: (items: FakeItem[]) => void;
        let releaseVendorBRender!: () => void;
        let isVendorBRenderBlocked = true;
        const vendorARequest = new Promise<FakeItem[]>((resolve) => {
            releaseVendorA = resolve;
        });
        const vendorBRequest = new Promise<FakeItem[]>((resolve) => {
            releaseVendorB = resolve;
        });
        const vendorBRender = new Promise<void>((resolve) => {
            releaseVendorBRender = () => {
                isVendorBRenderBlocked = false;
                resolve();
            };
        });
        const crossVendorCommits: boolean[] = [];
        const host = document.createElement('div');
        document.body.appendChild(host);
        const identityAdapter: VendorLinkedEntitiesAdapter<FakeItem> = {
            ...adapter,
            fetch: vi.fn()
                .mockReturnValueOnce(vendorARequest)
                .mockReturnValueOnce(vendorBRequest),
        };

        function BlockingVendorBSibling({ vendorId }: { vendorId: number }) {
            if (vendorId === 8 && isVendorBRenderBlocked) {
                throw vendorBRender;
            }
            return null;
        }

        function TransitionHarness() {
            const [vendorId, setVendorId] = useState(7);
            return (
                <>
                    <button
                        type="button"
                        onClick={() => startTransition(() => setVendorId(8))}
                    >
                        Show vendor B
                    </button>
                    <Suspense fallback={<div>Suspended vendor</div>}>
                        <Profiler
                            id="vendor-linked-identity"
                            onRender={() => {
                                if (host.querySelector('[data-testid="current-vendor"]')?.textContent !== '8') return;
                                crossVendorCommits.push(host.textContent?.includes('Vendor A linked item') ?? false);
                            }}
                        >
                            <output data-testid="current-vendor">{vendorId}</output>
                            {fakeTab(identityAdapter, vendorId)}
                            <BlockingVendorBSibling vendorId={vendorId} />
                        </Profiler>
                    </Suspense>
                </>
            );
        }

        render(<TransitionHarness />, { container: host });
        await waitFor(() => expect(identityAdapter.fetch).toHaveBeenCalledWith(7));

        fireEvent.click(screen.getByRole('button', { name: 'Show vendor B' }));
        expect(screen.getByTestId('current-vendor')).toHaveTextContent('7');
        expect(identityAdapter.fetch).toHaveBeenCalledTimes(1);

        await act(async () => {
            releaseVendorA([{ id: 1, name: 'Vendor A linked item', is_archived: false }]);
            await vendorARequest;
        });
        expect(screen.getByTestId('current-vendor')).toHaveTextContent('7');
        expect(screen.getByText('Vendor A linked item')).toBeInTheDocument();

        await act(async () => {
            releaseVendorBRender();
            await vendorBRender;
        });
        await waitFor(() => expect(identityAdapter.fetch).toHaveBeenCalledWith(8));
        expect(crossVendorCommits).not.toContain(true);
        expect(screen.queryByText('Vendor A linked item')).not.toBeInTheDocument();

        await act(async () => {
            releaseVendorB([]);
            await vendorBRequest;
        });
        expect(screen.getByText('links.fake.empty')).toBeInTheDocument();
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

    it('retries an initial linked-region failure without showing a false empty state', async () => {
        const user = userEvent.setup();
        let releaseRetry!: (items: FakeItem[]) => void;
        const retry = new Promise<FakeItem[]>((resolve) => {
            releaseRetry = resolve;
        });
        const failingAdapter: VendorLinkedEntitiesAdapter<FakeItem> = {
            ...adapter,
            fetch: vi.fn()
                .mockRejectedValueOnce(new Error('temporary outage'))
                .mockImplementationOnce(() => retry),
        };

        renderFakeTab(failingAdapter);

        expect(await screen.findByRole('alert')).toHaveTextContent('links.errors.load_failed');
        expect(screen.queryByText('links.fake.empty')).not.toBeInTheDocument();
        const retryButton = screen.getByRole('button', { name: 'actions.retry' });
        retryButton.focus();
        await user.click(retryButton);

        await waitFor(() => expect(failingAdapter.fetch).toHaveBeenCalledTimes(2));
        expect(retryButton).toHaveFocus();
        expect(retryButton).toHaveAttribute('aria-disabled', 'true');
        expect(retryButton).toHaveAttribute('aria-busy', 'true');
        fireEvent.click(retryButton);
        expect(failingAdapter.fetch).toHaveBeenCalledTimes(2);

        await act(async () => {
            releaseRetry([]);
        });

        await screen.findByText('links.fake.empty');
    });

    it('keeps safe linked rows visible when a same-vendor refresh fails', async () => {
        const staleAdapter: VendorLinkedEntitiesAdapter<FakeItem> = {
            ...adapter,
            fetch: vi.fn()
                .mockResolvedValueOnce([{ id: 1, name: 'Safe linked item', is_archived: false }])
                .mockRejectedValueOnce(new Error('temporary outage')),
        };

        renderFakeTab(staleAdapter);

        await screen.findByText('Safe linked item');
        await userEvent.click(screen.getByText('links.actions.link_existing'));
        await userEvent.click(screen.getByText('mock-link-target'));

        expect(await screen.findByRole('alert')).toHaveTextContent('links.errors.stale');
        expect(screen.getByText('Safe linked item')).toBeInTheDocument();
        expect(screen.queryByText('links.fake.empty')).not.toBeInTheDocument();
    });

    it('clears protected linked rows when a same-vendor refresh is forbidden', async () => {
        const deniedAdapter: VendorLinkedEntitiesAdapter<FakeItem> = {
            ...adapter,
            fetch: vi.fn()
                .mockResolvedValueOnce([{ id: 1, name: 'Protected linked item', is_archived: false }])
                .mockRejectedValueOnce(new ApiClientError({
                    status: 403,
                    messageKey: 'errorKeys.forbidden',
                })),
        };

        renderFakeTab(deniedAdapter);

        await screen.findByText('Protected linked item');
        await userEvent.click(screen.getByText('links.actions.link_existing'));
        await userEvent.click(screen.getByText('mock-link-target'));

        expect(await screen.findByRole('alert')).toHaveTextContent('links.errors.access_denied');
        expect(screen.queryByText('Protected linked item')).not.toBeInTheDocument();
        expect(screen.queryByText('links.fake.empty')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'actions.retry' })).not.toBeInTheDocument();
        expect(screen.queryByText('links.actions.link_existing')).not.toBeInTheDocument();
        expect(screen.queryByText('links.actions.add_fake')).not.toBeInTheDocument();
        expect(screen.queryByText('links.actions.manage_existing')).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not refresh the old vendor after its deferred link mutation completes', async () => {
        let releaseMutation!: () => void;
        const mutation = new Promise<void>((resolve) => {
            releaseMutation = resolve;
        });
        const identityAdapter: VendorLinkedEntitiesAdapter<FakeItem> = {
            ...adapter,
            fetch: vi.fn(async (vendorId: number) => [{
                id: vendorId,
                name: `Vendor ${vendorId} linked item`,
                is_archived: false,
            }]),
            link: vi.fn(() => mutation),
        };

        const view = renderFakeTab(identityAdapter, 7);
        await screen.findByText('Vendor 7 linked item');
        await userEvent.click(screen.getByText('links.actions.link_existing'));
        await userEvent.click(screen.getByText('mock-link-target'));
        await waitFor(() => expect(identityAdapter.link).toHaveBeenCalledWith(7, 101, undefined));

        view.rerender(fakeTab(identityAdapter, 8));
        await screen.findByText('Vendor 8 linked item');

        await act(async () => {
            releaseMutation();
        });

        await waitFor(() => expect(identityAdapter.fetch).toHaveBeenCalledTimes(2));
        expect(identityAdapter.fetch).toHaveBeenNthCalledWith(1, 7);
        expect(identityAdapter.fetch).toHaveBeenNthCalledWith(2, 8);
        expect(screen.getByText('Vendor 8 linked item')).toBeInTheDocument();
        expect(screen.queryByText('Vendor 7 linked item')).not.toBeInTheDocument();
    });
});
