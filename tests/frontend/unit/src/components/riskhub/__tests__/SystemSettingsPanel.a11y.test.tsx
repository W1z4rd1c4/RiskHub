import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemSettingsPanel } from '@/components/riskhub/SystemSettingsPanel';
import { FeedbackProvider } from '@/contexts/FeedbackContext';
import type { GlobalConfig } from '@/services/riskHubApi';
import { riskHubApi } from '@/services/riskHubApi';
import { createTestQueryClient } from '@test/queryClient';

/**
 * DS-04 / NEW-V1-04 (Phase 0): the boolean setting is a named `switch` with
 * state, value inputs are labelled by their setting name, and each Save button
 * says which setting it saves.
 */

vi.mock('@/i18n/hooks', async (importOriginal) => ({
    // `useFormat` stays real: PG-38 number grouping follows the UI language (en in tests).
    ...(await importOriginal<typeof import('@/i18n/hooks')>()),
    useTranslation: () => ({
        t: (key: string, options?: { name?: string }) => (options?.name ? `${key}:${options.name}` : key),
    }),
}));

vi.mock('@/services/riskHubApi', () => ({
    riskHubApi: {
        getAllConfig: vi.fn(),
        getCapabilities: vi.fn(),
        updateConfig: vi.fn(),
    },
}));

vi.mock('@/services/apiClient', () => ({
    apiClient: { toUiMessageKey: () => 'unknown' },
}));

function config(overrides: Partial<GlobalConfig>): GlobalConfig {
    return {
        id: 1,
        key: 'k',
        value: '',
        value_type: 'str',
        category: 'approvals',
        display_name: 'Setting',
        description: null,
        min_value: null,
        max_value: null,
        is_editable: true,
        updated_at: '2026-09-01T00:00:00Z',
        updated_by_name: null,
        ...overrides,
    };
}

function renderPanel({ canUpdate = true } = {}) {
    vi.mocked(riskHubApi.getCapabilities).mockResolvedValue({
        system_settings: { can_update: canUpdate },
    } as never);
    vi.mocked(riskHubApi.getAllConfig).mockResolvedValue({
        approvals: [
            config({
                id: 1,
                key: 'require_dual_approval',
                value: 'false',
                value_type: 'bool',
                display_name: 'Require dual approval',
                description: 'Two approvers for privileged changes.',
            }),
            config({ id: 2, key: 'approval_sla_days', value: '5', value_type: 'int', display_name: 'Approval SLA days' }),
            config({ id: 4, key: 'approval_amount_limit', value: '10000000', value_type: 'int', display_name: 'Approval amount limit' }),
            config({ id: 3, key: 'approval_mailbox', value: 'risk@example.test', display_name: 'Approval mailbox' }),
        ],
    } as never);
    const queryClient = createTestQueryClient();
    render(
        <QueryClientProvider client={queryClient}>
            <FeedbackProvider>
                <SystemSettingsPanel />
            </FeedbackProvider>
        </QueryClientProvider>,
    );
}

describe('SystemSettingsPanel accessibility (DS-04)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the boolean setting as a named switch with on/off state', async () => {
        const user = userEvent.setup();
        renderPanel();

        const toggle = await screen.findByRole('switch', { name: 'Require dual approval' });
        expect(toggle).toHaveAttribute('type', 'button');
        expect(toggle).toHaveAttribute('aria-checked', 'false');
        expect(toggle).toHaveAccessibleDescription('Two approvers for privileged changes.');
        expect(toggle.className).toContain('focus-ring');

        toggle.focus();
        await user.keyboard(' ');
        expect(toggle).toHaveAttribute('aria-checked', 'true');
        await user.keyboard('{Enter}');
        expect(toggle).toHaveAttribute('aria-checked', 'false');
    });

    it('renders a settings load failure as an error with retry (DS-17, GAP-C-11)', async () => {
        const user = userEvent.setup();
        vi.mocked(riskHubApi.getCapabilities).mockResolvedValue({ system_settings: { can_update: true } } as never);
        vi.mocked(riskHubApi.getAllConfig)
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({ approvals: [config({ id: 2, key: 'approval_sla_days', value: '5', value_type: 'int', display_name: 'Approval SLA days' })] } as never);
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <FeedbackProvider>
                    <SystemSettingsPanel />
                </FeedbackProvider>
            </QueryClientProvider>,
        );

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('admin:errors.failed_to_load_settings');

        await user.click(screen.getByRole('button', { name: 'actions.retry' }));
        expect(await screen.findByRole('textbox', { name: 'Approval SLA days' })).toHaveValue('5');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(riskHubApi.getAllConfig).toHaveBeenCalledTimes(2);
    });

    it('labels value inputs with their setting names', async () => {
        renderPanel();

        expect(await screen.findByRole('textbox', { name: 'Approval SLA days' })).toHaveValue('5');
        expect(screen.getByRole('textbox', { name: 'Approval mailbox' })).toHaveValue('risk@example.test');
    });

    it('groups integer digits in the UI language and saves the raw number (PG-38)', async () => {
        const user = userEvent.setup();
        vi.mocked(riskHubApi.updateConfig).mockResolvedValue({} as never);
        renderPanel();

        const limit = await screen.findByRole('textbox', { name: 'Approval amount limit' });
        expect(limit).toHaveValue('10,000,000');
        await user.type(limit, '0');
        expect(limit).toHaveValue('100,000,000');
        await user.click(screen.getByRole('button', { name: 'admin:system_settings.save_named:Approval amount limit' }));

        await waitFor(() => {
            expect(riskHubApi.updateConfig).toHaveBeenCalledWith('approval_amount_limit', '100000000');
        });
    });

    it('names each Save button after its setting and saves that setting', async () => {
        const user = userEvent.setup();
        vi.mocked(riskHubApi.updateConfig).mockResolvedValue({} as never);
        renderPanel();

        await user.click(await screen.findByRole('switch', { name: 'Require dual approval' }));
        const mailbox = screen.getByRole('textbox', { name: 'Approval mailbox' });
        await user.clear(mailbox);
        await user.type(mailbox, 'ops@example.test');

        const saveToggle = screen.getByRole('button', { name: 'admin:system_settings.save_named:Require dual approval' });
        expect(screen.getByRole('button', { name: 'admin:system_settings.save_named:Approval mailbox' })).toHaveAttribute('type', 'button');
        await user.click(saveToggle);

        await waitFor(() => {
            expect(riskHubApi.updateConfig).toHaveBeenCalledWith('require_dual_approval', 'true');
        });
        // D9 / GAP-B-10: the save outcome is a success toast naming the setting.
        const toast = (await screen.findByText('common:success.saved')).closest('li');
        expect(toast).toHaveAttribute('data-tone', 'success');
        expect(toast).toHaveTextContent('Require dual approval');
    });

    it('keeps the switch disabled without update capability', async () => {
        renderPanel({ canUpdate: false });

        const toggle = await screen.findByRole('switch', { name: 'Require dual approval' });
        await waitFor(() => {
            expect(riskHubApi.getCapabilities).toHaveBeenCalled();
        });
        expect(toggle).toBeDisabled();
        expect(toggle).toHaveAttribute('aria-checked', 'false');
    });
});
