import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthActionsProvider, useAuthActionsContext } from '@/contexts/AuthActionsContext';

function ActionsConsumer({
    onReady,
}: {
    onReady: (ctx: ReturnType<typeof useAuthActionsContext>) => void;
}) {
    const ctx = useAuthActionsContext();
    onReady(ctx);
    return null;
}

describe('split auth actions provider', () => {
    it('exposes login and logout independently of the session subtree', () => {
        let captured: ReturnType<typeof useAuthActionsContext> | null = null;

        render(
            <AuthActionsProvider>
                <ActionsConsumer onReady={(ctx) => {
                    captured = ctx;
                }}
                />
            </AuthActionsProvider>,
        );

        expect(captured).not.toBeNull();
        expect(typeof captured!.login).toBe('function');
        expect(typeof captured!.logout).toBe('function');
    });
});
