import { describe, expect, it } from 'vitest';

import {
    applyAuthenticatedSession,
    bootstrapAuthSession,
    trySilentSessionRefresh,
} from '@/services/session/coordinator';

describe('coordinator merged module', () => {
    it('exports applyAuthenticatedSession', () => expect(typeof applyAuthenticatedSession).toBe('function'));
    it('exports trySilentSessionRefresh', () => expect(typeof trySilentSessionRefresh).toBe('function'));
    it('exports bootstrapAuthSession', () => expect(typeof bootstrapAuthSession).toBe('function'));
});
