/**
 * Tests for API services.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { server } from '@/test/mocks/server';
import { controlApi } from '../controlApi';
import { riskApi } from '../riskApi';
import { executionApi } from '../executionApi';

// Setup MSW
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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

        expect(Array.isArray(executions)).toBe(true);
    });

    it('creates new execution', async () => {
        const newExecution = await executionApi.createExecution({
            control_id: 1,
            result: 'pass',
            findings: 'All checks passed',
        });

        expect(newExecution.id).toBeDefined();
        expect(newExecution.result).toBe('pass');
    });
});
