import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cesiumBuild = path.join(path.dirname(require.resolve('cesium/package.json')), 'Build', 'Cesium');
const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Serves Cesium's static engine assets (Workers, Assets, ThirdParty, Widgets) under /cesium/ in dev and copies
 * them into dist/cesium at build time. This avoids the unmaintained vite-plugin-cesium and keeps one source of truth.
 */
function cesiumStatic(): Plugin {
  const base = '/cesium/';
  return {
    name: 'terra-cesium-static',
    config: () => ({ define: { CESIUM_BASE_URL: JSON.stringify(base) } }),
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(base)) return next();
        const rel = decodeURIComponent(req.url.slice(base.length).split('?')[0]);
        const file = path.join(cesiumBuild, rel);
        if (!file.startsWith(cesiumBuild) || !existsSync(file)) return next();
        const { createReadStream, statSync } = await import('node:fs');
        if (statSync(file).isDirectory()) return next();
        const ext = path.extname(file).toLowerCase();
        const types: Record<string, string> = {
          '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif',
          '.wasm': 'application/wasm', '.glsl': 'text/plain', '.xml': 'application/xml', '.ktx2': 'image/ktx2',
          '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.woff': 'font/woff', '.woff2': 'font/woff2',
        };
        res.setHeader('Content-Type', types[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const out = path.join(rootDir, 'dist', 'cesium');
      mkdirSync(out, { recursive: true });
      for (const dir of ['Workers', 'Assets', 'ThirdParty', 'Widgets']) {
        cpSync(path.join(cesiumBuild, dir), path.join(out, dir), { recursive: true });
      }
    },
  };
}

/** Offline fixtures (synthetic OSM responder) for development and CI where the Overpass API is unreachable. */
function fixtures(): Plugin {
  const enabled = process.env.TERRA_FIXTURES === '1';
  return {
    name: 'terra-fixtures',
    async configureServer(server) {
      if (!enabled) return;
      const { fixtureMiddleware } = await import('./scripts/dev/syntheticOverpass.mjs');
      server.middlewares.use(fixtureMiddleware);
    },
    async configurePreviewServer(server) {
      if (!enabled) return;
      const { fixtureMiddleware } = await import('./scripts/dev/syntheticOverpass.mjs');
      server.middlewares.use(fixtureMiddleware);
    },
  };
}

function buildStamp(): { commit: string; time: string; dirty: boolean } {
  const run = (cmd: string) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  return { commit: run('git rev-parse --short HEAD') || 'unknown', time: new Date().toISOString(), dirty: run('git status --porcelain --untracked-files=no').length > 0 };
}

export default defineConfig({
  define: { __TERRA_BUILD__: JSON.stringify(buildStamp()) },
  plugins: [react(), cesiumStatic(), fixtures()],
  resolve: { alias: { '@': path.join(rootDir, 'src') } },
  server: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin' } },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/cesium')) return 'cesium';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
