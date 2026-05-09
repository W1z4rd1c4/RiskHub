import { act, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { PreferencesProvider, usePreferenceActions } from '@/contexts/PreferencesContext';
import { SessionProvider, useSession } from '@/contexts/SessionContext';

function SessionConsumer() {
    const count = useRef(0);
    const session = useSession();
    useEffect(() => {
        count.current += 1;
    });
    return <span data-testid="session-renders">{count.current}|{session.user?.id ?? 'none'}</span>;
}

function PrefMutator() {
    const { markPreferencesReady } = usePreferenceActions();
    return <button onClick={() => markPreferencesReady(true)}>flip</button>;
}

describe('split session and preferences providers', () => {
    it('mutating preferences does not re-render session consumer', () => {
        render(
            <SessionProvider>
                <PreferencesProvider>
                    <SessionConsumer />
                    <PrefMutator />
                </PreferencesProvider>
            </SessionProvider>,
        );

        const before = screen.getByTestId('session-renders').textContent;
        act(() => screen.getByText('flip').click());
        const after = screen.getByTestId('session-renders').textContent;

        expect(after).toBe(before);
    });
});
