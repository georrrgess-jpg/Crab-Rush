/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
  server: { host: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
