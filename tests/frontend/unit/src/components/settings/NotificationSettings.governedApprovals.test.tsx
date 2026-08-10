import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/services/notificationsApi', () => ({
    notificationsApi: {
        getPreferences: vi.fn(),
        updatePreferences: vi.fn(),
    },
}));

vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { notificationsApi } from '@/services/notificationsApi';
import type { NotificationPreferences } from '@/types/notification';

const preferences: NotificationPreferences = {
    approval_pending: true,
    approval_resolved: true,
    approval_cancelled: true,
    governed_approval_action_required: true,
    governed_approval_request_updates: true,
    kri_due_soon: true,
    kri_due_tomorrow: true,
    kri_overdue: true,
    kri_near_breach: true,
    kri_breach_detected: true,
    questionnaire_sent: true,
    questionnaire_due_soon: true,
    questionnaire_overdue: true,
    questionnaire_submitted: true,
    questionnaire_clarification_requested: true,
};

describe('NotificationSettings governed approval preferences', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(notificationsApi.getPreferences).mockResolvedValue(preferences);
        vi.mocked(notificationsApi.updatePreferences).mockImplementation(async (update) => ({
            ...preferences,
            ...update,
        }));
    });

    it('renders two accessible default-on switches and persists them independently', async () => {
        render(<NotificationSettings />);

        const actionRequired = await screen.findByRole('switch', {
            name: 'notifications.governed_approval_action_required',
        });
        const requestUpdates = screen.getByRole('switch', {
            name: 'notifications.governed_approval_request_updates',
        });
        expect(actionRequired).toHaveAttribute('aria-checked', 'true');
        expect(requestUpdates).toHaveAttribute('aria-checked', 'true');

        fireEvent.click(actionRequired);
        await waitFor(() => {
            expect(notificationsApi.updatePreferences).toHaveBeenCalledWith({
                governed_approval_action_required: false,
            });
        });
    });
});
