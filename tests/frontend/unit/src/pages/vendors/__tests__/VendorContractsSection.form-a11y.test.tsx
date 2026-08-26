/**
 * FR-P2b-1/2/3/5 (findings C1/C4/C5) — the VendorContractsSection *form* block
 * migrated to the accessible `Field` primitive: `noValidate` on the form, every
 * label associated with its control, and a dropped closed-lists fetch surfaces a
 * retryable notice instead of silently-empty dropdowns. The #61 SortableTable
 * error contract lives in VendorContractsSection.error-contract.test.tsx.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import * as axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetContracts = vi.fn();
const mockGetClosedLists = vi.fn();
const mockCreateContract = vi.fn();
const mockArchiveContract = vi.fn();

vi.mock('@/services/vendorContractApi', () => ({
    vendorContractApi: {
        getContracts: (...args: unknown[]) => mockGetContracts(...args),
        createContract: (...args: unknown[]) => mockCreateContract(...args),
        updateContract: vi.fn(),
        archiveContract: (...args: unknown[]) => mockArchiveContract(...args),
        restoreContract: vi.fn(),
    },
}));
vi.mock('@/services/assetApi', () => ({
    assetApi: {
        getClosedLists: (...args: unknown[]) => mockGetClosedLists(...args),
    },
}));

import { VendorContractsSection } from '@/pages/vendors/VendorContractsSection';
import i18n from '@/i18n';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(node: Element): Promise<void> {
    const results = await axe.run(node, {
        runOnly: { type: 'tag', values: AXE_TAGS },
        rules: { 'color-contrast': { enabled: false } },
    });
    const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`).join('\n');
    expect(summary, summary).toBe('');
}

function renderSection() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <VendorContractsSection
                    vendorId={1}
                    canManageContracts
                    protectedChangeRequiresApproval
                />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

async function openForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTestId('vendor-contract-add'));
    return screen.getByTestId('vendor-contract-form');
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGetContracts.mockResolvedValue([]);
    mockGetClosedLists.mockResolvedValue({});
    mockCreateContract.mockResolvedValue({ id: 1 });
    mockArchiveContract.mockResolvedValue(undefined);
});

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('VendorContractsSection form — Field migration (#59)', () => {
    it('opens a noValidate form whose controls are label-associated', async () => {
        const user = userEvent.setup();
        renderSection();

        const form = (await openForm(user)) as HTMLFormElement;
        expect(form.noValidate).toBe(true);

        expect(
            screen.getByRole('textbox', { name: i18n.t('vendors:contracts.form.contract_reference') }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('combobox', { name: i18n.t('vendors:contracts.form.records_system') }),
        ).toBeInTheDocument();
    });

    it('reads .isError on the closed-lists fetch with a refresh affordance inside the form', async () => {
        const user = userEvent.setup();
        mockGetClosedLists.mockRejectedValue(new Error('network down'));
        renderSection();

        await openForm(user);

        expect(await screen.findByText(i18n.t('vendors:contracts.form.lists_failed'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: i18n.t('vendors:actions.refresh') })).toBeInTheDocument();
    });

    it('has no axe violations with the contract form open', async () => {
        const user = userEvent.setup();
        const { container } = renderSection();

        await openForm(user);

        await expectNoAxeViolations(container);
    });

    it('rejects a blank governed create reason locally with an accessible field error', async () => {
        const user = userEvent.setup();
        const { container } = renderSection();
        const form = await openForm(user);

        await user.click(screen.getByTestId('vendor-contract-form-save'));

        const reason = screen.getByTestId('vendor-contract-request-reason');
        expect(reason).toHaveFocus();
        expect(reason).toHaveAttribute('id', 'vendor-contract-request-reason');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        expect(reason).toHaveAccessibleDescription(
            new RegExp(i18n.t('vendors:errors.request_reason_required')),
        );
        expect(screen.getByRole('alert')).toHaveTextContent(
            i18n.t('vendors:errors.request_reason_required'),
        );
        expect(mockCreateContract).not.toHaveBeenCalled();
        expect(form).toBeInTheDocument();

        await expectNoAxeViolations(container);
    });

    it('collects a governed archive reason before invoking the archive seam', async () => {
        mockGetContracts.mockResolvedValue([
            {
                id: 7,
                vendor_id: 1,
                contract_reference: 'GOV-CTR-7',
                is_archived: false,
                capabilities: {
                    can_read: true,
                    can_update: true,
                    can_archive: true,
                    can_restore: false,
                },
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
            },
        ]);
        const user = userEvent.setup();
        renderSection();

        await user.click(await screen.findByTestId('vendor-contract-archive-7'));
        const dialog = screen.getByRole('alertdialog');
        const confirm = within(dialog).getByRole('button', {
            name: i18n.t('vendors:contracts.actions.archive'),
        });
        expect(confirm).toBeDisabled();

        await user.type(
            within(dialog).getByRole('textbox', {
                name: new RegExp(i18n.t('vendors:form.request_reason')),
            }),
            '  Review governed Contract archive  ',
        );
        await user.click(confirm);

        await waitFor(() => expect(mockArchiveContract).toHaveBeenCalledWith(
            1,
            7,
            'Review governed Contract archive',
        ));
    });

    it('keeps a rejected archive error inside the dialog and allows a successful retry', async () => {
        mockGetContracts.mockResolvedValue([
            {
                id: 7,
                vendor_id: 1,
                contract_reference: 'GOV-CTR-7',
                is_archived: false,
                capabilities: {
                    can_read: true,
                    can_update: true,
                    can_archive: true,
                    can_restore: false,
                },
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
            },
        ]);
        mockArchiveContract
            .mockRejectedValueOnce(Object.assign(new Error('reason rejected'), { status: 422 }))
            .mockResolvedValueOnce(undefined);
        const user = userEvent.setup();
        renderSection();

        await user.click(await screen.findByTestId('vendor-contract-archive-7'));
        let dialog = screen.getByRole('alertdialog');
        await user.type(
            within(dialog).getByRole('textbox', {
                name: new RegExp(i18n.t('vendors:form.request_reason')),
            }),
            'First governed reason',
        );
        await user.click(within(dialog).getByRole('button', {
            name: i18n.t('vendors:contracts.actions.archive'),
        }));

        const dialogAlert = await within(dialog).findByRole('alert');
        expect(dialogAlert).toHaveTextContent(i18n.t('vendors:contracts.errors.mutation_failed'));
        expect(screen.getAllByRole('alert')).toHaveLength(1);

        dialog = screen.getByRole('alertdialog');
        await user.type(
            within(dialog).getByRole('textbox', {
                name: new RegExp(i18n.t('vendors:form.request_reason')),
            }),
            'Corrected governed reason',
        );
        await user.click(within(dialog).getByRole('button', {
            name: i18n.t('vendors:contracts.actions.archive'),
        }));

        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        expect(mockArchiveContract).toHaveBeenNthCalledWith(2, 1, 7, 'Corrected governed reason');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
