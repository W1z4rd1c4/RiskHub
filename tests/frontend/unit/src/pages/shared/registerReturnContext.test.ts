import { describe, expect, it } from 'vitest';

import {
    appendRegisterReturnTo,
    resolveRegisterReturnTo,
} from '@/pages/shared/registerReturnContext';

describe('register return context', () => {
    it('preserves the exact internal list working set including query and hash', () => {
        const workingSet = '/risks?q=claims&view=department&page=4#group-heading';

        expect(resolveRegisterReturnTo(workingSet, '/risks')).toBe(workingSet);
        expect(appendRegisterReturnTo('/risks/42', workingSet)).toBe(
            `/risks/42?return_to=${encodeURIComponent(workingSet)}`,
        );
    });

    it('allows encoded separators in query and hash values while keeping the path exact', () => {
        const workingSet = '/risks?q=margin%2025%25&source=https%3A%2F%2Fexample.test#group%2Fheading';

        expect(resolveRegisterReturnTo(workingSet, '/risks')).toBe(workingSet);
    });

    it.each(['risks', 'controls', 'kris', 'issues', 'processes', 'assets', 'vendors'])(
        'preserves a bounded Department %s-tab working set',
        (register) => {
            const workingSet = `/departments/7?tab=${register}&q=payments&page=3#group-heading`;

            expect(resolveRegisterReturnTo(workingSet, `/${register}`)).toBe(workingSet);
        },
    );

    it.each([
        '/departments/7?tab=controls&page=3',
        '/departments/7?tab=threats&page=3',
        '/departments/7?tab=users&page=3',
        '/departments/0?tab=risks&page=3',
        '/departments/%37?tab=risks&page=3',
        '/departments/7%2F..%2F8?tab=risks&page=3',
        '/departments/7?tab=r%69sks&page=3',
        '/departments/7?t%61b=risks&page=3',
        '/departments/7?tab=risks&tab=controls&page=3',
    ])('rejects mismatched or encoded Department Risk-tab destination %s', (candidate) => {
        expect(resolveRegisterReturnTo(candidate, '/risks')).toBe('/risks');
    });

    it.each([
        'https://attacker.example/risks',
        '//attacker.example/risks',
        '/\\attacker.example/risks',
        '%2F%2Fattacker.example%2Frisks',
        '%252F%252Fattacker.example%252Frisks',
        '/risks%2F..%2Fcontrols',
        '/%2e%2e/risks?page=3',
        '/controls/%2e%2e/risks?page=3',
        '/controls/../risks?page=3',
        '/controls?page=2',
        'risks?page=2',
        '/risks\n?page=2',
    ])('rejects unsafe or mismatched destination %s', (candidate) => {
        expect(resolveRegisterReturnTo(candidate, '/risks')).toBe('/risks');
    });
});
