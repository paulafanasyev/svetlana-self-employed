import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path: root domain serves from '/', GitHub Pages project sites serve from
// '/<repo>/'. The same bundle is used for both deployments (§2, §53).
const BASE = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base: BASE,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
      '/storage': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
