import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const devApiTarget = process.env.VITE_DEV_API_TARGET || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        prodLoginPreview: path.resolve(__dirname, 'prod-login-preview.html'),
      },
    },
    chunkSizeWarningLimit: 1500, // Raise limit to 1500 kB
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
