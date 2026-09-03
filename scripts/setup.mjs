#!/usr/bin/env node
/** One-shot developer setup: checks Node, installs dependencies, prepares .env and derived data. */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';

const [major] = process.versions.node.split('.').map(Number);
if (major < 20) { console.error(`Node 20+ required, found ${process.versions.node}`); process.exit(1); }
const run = (cmd) => { console.log(`\n> ${cmd}`); execSync(cmd, { stdio: 'inherit' }); };
if (!existsSync('node_modules')) run('npm install --no-audit --no-fund');
if (!existsSync('.env')) { copyFileSync('.env.example', '.env'); console.log('Created .env from .env.example (all optional keys empty → demonstration mode).'); }
if (!existsSync('public/data/ne/land_50m.json')) run('node scripts/process-assets.mjs');
console.log('\nSetup complete. Start with: npm run dev');
