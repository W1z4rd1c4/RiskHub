import { describe, expect, it } from 'vitest';
import { createMemoryRouter } from 'react-router-dom';

import { sanitizeReturnTo } from '@/services/authRedirect';

const controls = [
    ...Array.from({ length: 32 }, (_, code) => code),
    ...Array.from({ length: 33 }, (_, code) => code + 127),
];

describe('sanitizeReturnTo', () => {
    it.each([
        '/risks/42',
        '/departments/12?tab=risks&search=Risk%20%26%20control#register',
        '/risks?search=a+b&encoded=%2f%252F&return_to=%2Frisks%3Fx%3D1',
        '/risks?url=https%3A%2F%2Fexample.test%2F#%2Fdetails',
        '/risks/%09/detail',
        '/risks/číslo?search=%C4%8D',
    ])('preserves the internal path and its query/hash encoding: %s', (path) => {
        expect(sanitizeReturnTo(path)).toBe(path);
    });

    it('preserves ordinary whitespace trimming and internal backslash normalization', () => {
        expect(sanitizeReturnTo('  /risks\\42  ')).toBe('/risks/42');
    });

    it.each([null, undefined, '', ' ', 'risks/42', '?tab=risks', '#details',
        '/\\evil.example', '\\\\evil.example', '//evil.example',
        'https://evil.example', 'https://riskhub.invalid/risks', 'javascript:alert(1)',
    ])('rejects non-internal targets: %j', (value) => {
        expect(sanitizeReturnTo(value)).toBe('/');
    });

    it.each(controls)('rejects control character %i at every position before trimming', (code) => {
        const control = String.fromCharCode(code);
        for (const value of [`/${control}/evil.example`, `${control}/risks`, `/risks${control}`,
            `/risks?q=${control}`, `/risks#${control}`]) {
            expect(sanitizeReturnTo(value)).toBe('/');
        }
    });

    it.each([
        ['raw tab', '/\t/evil.example', '/\t/evil.example', '/'],
        ['once-encoded tab', '/%09/evil.example', '/\t/evil.example', '/'],
        ['twice-encoded tab', '/%2509/evil.example', '/%09/evil.example', '/%09/evil.example'],
        ['once-encoded newlines', '/%0D%0A/evil.example', '/\r\n/evil.example', '/'],
        ['once-encoded backslash', '/%5Cevil.example', '/\\evil.example', '/'],
        ['once-encoded slashes', '%2F%2Fevil.example', '//evil.example', '/'],
        ['internal query', '%2Frisks%3Fq%3Da%252Bb%26next%3D%252Fcontrols%23details',
            '/risks?q=a%2Bb&next=%2Fcontrols#details', '/risks?q=a%2Bb&next=%2Fcontrols#details'],
    ])('decodes only the outer query and stays in the data router: %s', async (_label, queryValue, decoded, target) => {
        const router = createMemoryRouter([{ path: '*', id: 'workspace' }], {
            initialEntries: [`/login?returnTo=${queryValue}`],
        });
        try {
            // This is the same URLSearchParams boundary used by LoginPage.
            const value = new URLSearchParams(router.state.location.search).get('returnTo');
            expect(value).toBe(decoded);
            expect(sanitizeReturnTo(value)).toBe(target);
            expect(new URL(target, 'https://riskhub.example').origin).toBe('https://riskhub.example');
            await router.navigate(sanitizeReturnTo(value), { replace: true });
            const { pathname, search, hash } = router.state.location;
            expect(`${pathname}${search}${hash}`).toBe(target);
            expect(router.state.matches[0].route.id).toBe('workspace');
            expect(router.state.historyAction).toBe('REPLACE');
        } finally {
            router.dispose();
        }
    });

    it.each(['/\t/evil.example', '//evil.example', 'https://evil.example'])('keeps the router external-navigation defense: %j', async (target) => {
        const router = createMemoryRouter([{ path: '*' }], { initialEntries: ['/login'] });
        try {
            await expect(router.navigate(target)).rejects.toThrow('External navigation is not allowed');
            expect(router.state.location.pathname).toBe('/login');
        } finally {
            router.dispose();
        }
    });
});
