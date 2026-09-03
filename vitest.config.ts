import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  define: { CESIUM_BASE_URL: JSON.stringify('/cesium/') },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20000,
    server: { deps: { inline: ['cesium'] } },
  },
});
