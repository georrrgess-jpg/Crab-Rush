// Usage: node scripts/models.mjs <label> [--no-build]
// Model review sheet (UPDATE4_PLAN.md §4): renders every obstacle and pickup model on its own and
// tiles them into docs/screenshots/<label>-models.png.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? 'dev';
if (!args.includes('--no-build')) execSync('npx vite build', { stdio: 'inherit' });
const tmp = mkdtempSync(path.join(os.tmpdir(), 'models-'));
const port = 5900 + Math.floor(Math.random() * 300);
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
await page.goto(`http://localhost:${port}/?shots&reset&notut&quality=high`);
await page.waitForFunction(() => window.__crab?.ready);
const shots = await page.evaluate(() => window.__crab.models(320));
const files = [];
for (const [id, url] of Object.entries(shots)) {
  const f = path.join(tmp, `${id}.png`);
  writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
  files.push(`-label "${id}" "${f}"`);
}
const out = path.resolve(`docs/screenshots/${label}-models.png`);
execSync(`montage ${files.join(' ')} -background "#cfe8f6" -tile 6x -geometry 320x320+6+6 -pointsize 20 "${out}"`);
console.log('saved', path.relative(process.cwd(), out));
await browser.close();
server.kill();
