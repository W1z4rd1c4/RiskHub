/**
 * Tests for API services.
 */
import { describe, it, expect } from 'vitest';
import { controlApi } from '@/services/controlApi';
import { riskApi } from '@/services/riskApi';
import { executionApi } from '@/services/executionApi';

describe('controlApi', () => {
    it('fetches controls list', async () => {
        const controls = await controlApi.getControls({});

        expect(Array.isArray(controls)).toBe(true);
        expect(controls.length).toBeGreaterThan(0);
    });
});

describe('riskApi', () => {
    it('fetches risks list', async () => {
        const risks = await riskApi.getRisks({});

        expect(Array.isArray(risks)).toBe(true);
        expect(risks.length).toBeGreaterThan(0);
    });
});

describe('executionApi', () => {
    it('fetches executions list', async () => {
        const executions = await executionApi.getExecutions();

        expect(Array.isArray(executions.items)).toBe(true);
        expect(typeof executions.total).toBe('number');
    });
});
