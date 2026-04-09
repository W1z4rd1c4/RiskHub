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

        expect(Array.isArray(controls.items)).toBe(true);
        expect(controls.items.length).toBeGreaterThan(0);
        expect(typeof controls.total).toBe('number');
    });
});

describe('riskApi', () => {
    it('fetches risks list', async () => {
        const risks = await riskApi.getRisks({});

        expect(Array.isArray(risks.items)).toBe(true);
        expect(risks.items.length).toBeGreaterThan(0);
        expect(typeof risks.total).toBe('number');
    });
});

describe('executionApi', () => {
    it('fetches executions list', async () => {
        const executions = await executionApi.getExecutions();

        expect(Array.isArray(executions.items)).toBe(true);
        expect(typeof executions.total).toBe('number');
    });
});
