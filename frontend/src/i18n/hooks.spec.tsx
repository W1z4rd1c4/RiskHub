import { useEffect, useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useTranslation } from './hooks';

const rawT = vi.fn((key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key);

vi.mock('react-i18next', async () => {
    const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
    return {
        ...actual,
        useTranslation: () => ({
            t: rawT,
            i18n: { language: 'en', changeLanguage: vi.fn() },
        }),
    };
});

function CaptureT({ onCapture }: { onCapture: (tRef: unknown) => void }) {
    const { t } = useTranslation('common');
    const [counter, setCounter] = useState(0);

    useEffect(() => {
        onCapture(t);
    });

    return (
        <button type="button" onClick={() => setCounter((c) => c + 1)}>
            {t('label', `clicked:${counter}`)}
        </button>
    );
}

describe('useTranslation()', () => {
    it('returns a stable `t` reference across re-renders', async () => {
        const user = userEvent.setup();
        const captured: unknown[] = [];

        render(<CaptureT onCapture={(tRef) => captured.push(tRef)} />);

        expect(screen.getByRole('button')).toHaveTextContent('clicked:0');
        await user.click(screen.getByRole('button'));
        expect(screen.getByRole('button')).toHaveTextContent('clicked:1');

        // We expect at least two renders: initial + after click.
        expect(captured.length).toBeGreaterThanOrEqual(2);
        expect(captured[0]).toBe(captured[1]);
    });

    it('preserves fallback string call shape via defaultValue', () => {
        function Test() {
            const { t } = useTranslation('common');
            const results = useMemo(() => {
                return {
                    a: t('missing.key', 'fallback'),
                    b: t('missing.key', { defaultValue: 'fallback2' }),
                };
            }, [t]);
            return (
                <div>
                    <span>{results.a}</span>
                    <span>{results.b}</span>
                </div>
            );
        }

        render(<Test />);

        const spans = screen.getAllByText(/fallback/);
        expect(spans.map((s) => s.textContent)).toEqual(['fallback', 'fallback2']);
    });

    it('normalizes errorKeys-prefixed keys to the errorKeys namespace', () => {
        rawT.mockClear();

        function Test() {
            const { t } = useTranslation('auth');
            return <span>{t('errorKeys.demo_login_failed', { ns: 'errorKeys' })}</span>;
        }

        render(<Test />);

        expect(rawT).toHaveBeenCalledWith(
            'demo_login_failed',
            expect.objectContaining({ ns: 'errorKeys' }),
        );
        expect(screen.getByText('demo_login_failed')).toBeInTheDocument();
    });
});
