import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const devApiTarget = process.env.VITE_DEV_API_TARGET || 'http://localhost:8000'
const loginDependencyGraphPath = path.resolve(__dirname, '.cache/login-dependency-graph.json')

function loginDependencyGraph(): Plugin {
  return {
    name: 'riskhub-login-dependency-graph',
    buildStart() {
      rmSync(loginDependencyGraphPath, { force: true })
    },
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle)
        .filter((entry) => entry.type === 'chunk')
        .map((chunk) => ({
          fileName: chunk.fileName,
          facadeModuleId: chunk.facadeModuleId,
          isEntry: chunk.isEntry,
          imports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
          modules: Object.keys(chunk.modules),
        }));

      mkdirSync(path.dirname(loginDependencyGraphPath), { recursive: true })
      writeFileSync(loginDependencyGraphPath, JSON.stringify({ version: 1, chunks }, null, 2))
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), loginDependencyGraph()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    manifest: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        prodLoginPreview: path.resolve(__dirname, 'prod-login-preview.html'),
      },
    },
    // Diagnostic for any individual chunk; this is not a login-graph budget.
    chunkSizeWarningLimit: 900,
  },
  server: {
    proxy: {
      '/api': {
        target: devApiTarget,
        changeOrigin: true,
      },
    },
  },
})
