/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static build, host-agnostic (relative base) so it runs on Cloudflare Pages or any static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 4600,
    rollupOptions: {
      output: {
        // keep the big, rarely-changing libraries in their own long-cached chunks
        manualChunks(id: string) {
          if (id.includes('@dimforge/rapier3d')) return 'physics';
          if (id.includes('node_modules/three/') || id.includes('node_modules/postprocessing/'))
            return 'three';
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/scheduler') ||
            id.includes('node_modules/zustand')
          )
            return 'ui-vendor';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/sim/**/*.test.ts'],
    testTimeout: 120000,
  },
});
