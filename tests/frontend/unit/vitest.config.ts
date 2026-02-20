import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    root: path.resolve(__dirname),
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [path.resolve(__dirname, '../../../frontend/vitest.setup.ts')],
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        coverage: {
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'src/test/'],
            reportsDirectory: path.resolve(__dirname, '../../results/frontend/unit/coverage'),
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '../../../frontend/src'),
            '@test': path.resolve(__dirname, './src/test'),
        },
    },
});
