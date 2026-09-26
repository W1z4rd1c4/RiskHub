import { useNavigate } from 'react-router-dom';
import { useLayoutEffect, useRef, useState } from 'react';

/** Capture once before paint; visiting a link never redeems it. StrictMode safe. */
export function useFragmentCredential() {
    const navigate = useNavigate();
    const captured = useRef(false);
    const [grant, setGrant] = useState('');
    useLayoutEffect(() => {
        if (captured.current) return;
        captured.current = true;
        const raw = window.location.hash.slice(1);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        void navigate({ hash: '' }, { replace: true, state: null });
        if (/^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/.test(raw)) setGrant(raw);
    }, [navigate]);
    return [grant, setGrant] as const;
}

/** Recovery messages can be pasted as complete same-origin links or credentials. */
export function recoveryCredential(value: string): string {
    let raw = value.trim();
    if (raw.includes('://')) {
        try {
            const url = new URL(raw);
            if (url.origin !== window.location.origin || !['/auth/local/recover', '/auth/local/recover-email'].includes(url.pathname)) return '';
            raw = url.hash.slice(1);
        } catch { return ''; }
    }
    return /^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/.test(raw) ? raw : '';
}
