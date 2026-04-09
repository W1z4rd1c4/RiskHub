import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notificationsApi } from '@/services/notificationsApi';

describe('notificationsApi response validation', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('accepts issue notifications with nullable metadata', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (!url.endsWith('/api/v1/notifications')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }

            return Promise.resolve(new Response(JSON.stringify({
                items: [
                    {
                        id: 41,
                        type: 'issue_due_soon',
                        title: 'Issue due soon',
                        message: 'An issue needs attention soon.',
                        resource_type: null,
                        resource_id: null,
                        is_read: false,
                        created_at: '2026-04-07T10:00:00Z',
                        expires_at: null,
                    },
                ],
                total: 1,
                skip: 0,
                limit: 20,
                unread_count: 1,
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        });

        await expect(notificationsApi.list()).resolves.toMatchObject({
            items: [
                {
                    type: 'issue_due_soon',
                    resource_type: null,
                    resource_id: null,
                    expires_at: null,
                },
            ],
            unread_count: 1,
        });
    });

    it('accepts unread count payloads from the dedicated count endpoint', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (!url.endsWith('/api/v1/notifications/unread/count')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }

            return Promise.resolve(new Response(JSON.stringify({ count: 3 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        });

        await expect(notificationsApi.getUnreadCount()).resolves.toEqual({ count: 3 });
    });

    it('keeps unread_count validation for mark-as-read responses', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (!url.endsWith('/api/v1/notifications/41/read')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }

            return Promise.resolve(new Response(JSON.stringify({ unread_count: 2 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        });

        await expect(notificationsApi.markAsRead(41)).resolves.toEqual({ unread_count: 2 });
    });
});
