/**
 * Tests for directory emulator API services.
 */
import { describe, it, expect } from 'vitest';
import { directoryApi } from '../directoryApi';

describe('directoryApi', () => {
    it('fetches directory sync history', async () => {
        const logs = await directoryApi.listDirectorySyncHistory();

        expect(Array.isArray(logs)).toBe(true);
        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0]).toHaveProperty('status');
    });

    it('previews directory sync', async () => {
        const preview = await directoryApi.previewDirectorySync();

        expect(preview.created_count).toBeGreaterThanOrEqual(0);
        expect(preview.diffs).toBeDefined();
    });

    it('applies directory sync', async () => {
        const result = await directoryApi.applyDirectorySync();

        expect(result.updated_count).toBeGreaterThanOrEqual(0);
        expect(result.diffs.length).toBeGreaterThan(0);
    });
});
