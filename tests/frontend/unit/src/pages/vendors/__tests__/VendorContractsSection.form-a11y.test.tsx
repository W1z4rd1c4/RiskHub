/**
 * FR-P2b-1/2/3/5 (findings C1/C4/C5) — the VendorContractsSection *form* block
 * migrated to the accessible `Field` primitive: `noValidate` on the form, every
 * label associated with its control, and a dropped closed-lists fetch surfaces a
 * retryable notice instead of silently-empty dropdowns. The #61 SortableTable
 * error contract lives in VendorContractsSection.error-contract.test.tsx.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import * as axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetContracts = vi.fn();
const mockGetClosedLists = vi.fn();

vi.mock('@/services/vendorContractApi', () => ({
    vendorContractApi: {
        getContracts: (...args: unknown[]) => mockGetContracts(...args),
        createContract: vi.fn(),
        updateContract: vi.fn(),
        archiveContract: vi.fn(),
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
                <VendorContractsSection vendorId={1} canManageContracts />
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
});
