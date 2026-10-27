// Usage: node scripts/crab-closeup.mjs <label> [--no-build] [--body=sandy] [--hat=straw]
// Large close-up renders of the player crab (front, three-quarter, side, back) for model review.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? 'dev';
const opt = (k, d) => (args.find((x) => x.startsWith(`--${k}=`)) ?? `=${d}`).split('=')[1];
if (!args.includes('--no-build')) execSync('npx vite build', { stdio: 'inherit' });
const port = 5600 + Math.floor(Math.random() * 300);
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${port}/`;
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(base)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 450 } });
await page.goto(`${base}?shots&reset&quality=high`);
await page.waitForFunction(() => window.__crab?.ready);
await page.addStyleTag({ content: '#ui{display:none!important} #vignette{display:none!important}' });
const body = opt('body', 'sandy');
const hat = opt('hat', 'straw');
await page.evaluate(([b, h]) => { window.__crab.setState('title'); window.__crab.wear('bodies', b); window.__crab.wear('hats', h); window.__crab.frames(10); }, [body, hat]);
const files = [];
const views = [[0, 1.25, 2.6], [1.8, 1.4, 1.9], [2.6, 1.1, 0], [0.4, 1.5, -2.6]];
for (let i = 0; i < views.length; i++) {
  const [x, y, z] = views[i];
  await page.evaluate(([x, y, z]) => { window.__crab.cam(x, y, z); window.__crab.frames(3); }, [x, y, z]);
  const f = path.resolve(`docs/screenshots/.cu-${i}.png`);
  await page.screenshot({ path: f, clip: { x: 400, y: 0, width: 800, height: 450 } });
  files.push(f);
}
const out = path.resolve(`docs/screenshots/${label}-closeup-${body}.png`);
execSync(`convert ${files.map((f) => `"${f}"`).join(' ')} -resize 600x +append "${out}" && rm ${files.map((f) => `"${f}"`).join(' ')}`);
console.log('saved', path.relative(process.cwd(), out));
await browser.close();
server.kill();
process.exit(0);
