/* global process */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Allow the proxy target to be overridden via env var.
// When running Vite inside the frontend Docker container (dev-in-Docker),
// 'localhost' resolves to the container itself — not the backend container.
// Set API_TARGET=http://backend:3001 and WS_TARGET=ws://backend:3001
// in docker-compose.dev.yml to route correctly over the Docker network.
const apiTarget = process.env.API_TARGET ?? 'http://localhost:3001';
const wsTarget  = process.env.WS_TARGET  ?? 'ws://localhost:3001';

export default defineConfig({
  plugins: [react()],
  envDir: '../',
  server: {
    proxy: {
      '/api': {
        target:       apiTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: wsTarget,
        ws:     true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
